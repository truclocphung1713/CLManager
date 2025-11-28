// ==UserScript==
// @name         草榴Manager
// @namespace    http://tampermonkey.net/
// @version      1.11.0
// @description  草榴搜索/板块悬停放大封面、标题预览图、品质徽章与 qBittorrent 一键发送和下载按钮。
// @author       truclocphung1713
// @match        https://t66y.com/search.php*
// @match        https://t66y.com/thread0806.php*
// @match        https://t66y.com/htm_data/*
// @match        https://t66y.com/htm_mob/*
// @match        http://t66y.com/search.php*
// @match        http://t66y.com/thread0806.php*
// @match        http://t66y.com/htm_data/*
// @match        http://t66y.com/htm_mob/*
// @icon         none
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @connect      www.rmdown.com
// @connect      *
// @updateURL    https://raw.githubusercontent.com/truclocphung1713/CLManager/refs/heads/main/CLManager.user.js
// @downloadURL  https://raw.githubusercontent.com/truclocphung1713/CLManager/refs/heads/main/CLManager.user.js
// ==/UserScript==

(function () {
    'use strict';

    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    
    // 统一 CLM 命名空间到页面 window，确保主脚本和远程模块共享同一个对象
    const CLM = pageWindow.CLM || (pageWindow.CLM = {});
    if (pageWindow !== window) {
        window.CLM = CLM;
    }
    
    const downloadResolveCache = new Map();
    const DOWNLOAD_RECORDS_KEY = '草榴ManagerDownloadedThreads';
    let downloadRecordsCache = null;
    const downloadStatusListeners = new Map();

    /**
     * 检测是否是手机端页面
     */
    function isMobilePage() {
        const href = window.location.href;
        
        // 优先检查 mobile.php?ismobile 参数
        if (href.indexOf('mobile.php?ismobile=yes') !== -1 || href.indexOf('mobile.php?ismobile=1') !== -1) {
            console.log('草榴Manager: 检测到手机端 (mobile.php?ismobile=yes)');
            return true;
        }
        if (href.indexOf('mobile.php?ismobile=no') !== -1 || href.indexOf('mobile.php?ismobile=0') !== -1) {
            console.log('草榴Manager: 检测到电脑端 (mobile.php?ismobile=no)');
            return false;
        }
        
        // 检测URL中是否包含 htm_mob
        if (href.indexOf('/htm_mob/') !== -1) {
            console.log('草榴Manager: 检测到手机端 (htm_mob)');
            return true;
        }
        
        // 检测viewport meta标签
        const viewportMeta = document.querySelector('meta[name="viewport"]');
        if (viewportMeta && viewportMeta.content.indexOf('user-scalable=no') !== -1) {
            console.log('草榴Manager: 检测到手机端 (viewport meta)');
            return true;
        }
        
        // 检查是否有手机端特有的DOM结构
        const mobileIndicator = document.querySelector('.mobile-only, #mobile-content, .m-header');
        if (mobileIndicator) {
            console.log('草榴Manager: 检测到手机端 (DOM结构)');
            return true;
        }
        
        console.log('草榴Manager: 检测到电脑端 (默认)');
        return false;
    }

    /**
     * 检测页面类型
     */
    function detectPageType() {
        const href = window.location.href;
        const isMobile = isMobilePage();
        
        if (href.indexOf('/htm_mob/') !== -1 || href.indexOf('/htm_data/') !== -1) {
            return isMobile ? 'mobile-thread' : 'desktop-thread';
        }
        if (href.indexOf('search.php') !== -1) {
            return isMobile ? 'mobile-search' : 'desktop-search';
        }
        if (href.indexOf('thread0806.php') !== -1) {
            return isMobile ? 'mobile-forum' : 'desktop-forum';
        }
        return 'unknown';
    }

    /**
     * 向页面注入 CSS
     */
    function injectStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /**
     * 跨域文本请求（基础设施，保留在主脚本）
     */
    function fetchCrossOriginText(url) {
        if (!url) {
            return Promise.reject(new Error('無效的請求地址'));
        }
        if (typeof GM_xmlhttpRequest === 'function') {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    headers: {
                        'Referer': 'https://www.rmdown.com/'
                    },
                    onload: (resp) => {
                        if (resp.status >= 200 && resp.status < 400) {
                            resolve(resp.responseText);
                        } else {
                            reject(new Error('HTTP ' + resp.status));
                        }
                    },
                    onerror: () => reject(new Error('網絡錯誤')),
                    ontimeout: () => reject(new Error('請求超時'))
                });
            });
        }
        return fetch(url, { credentials: 'include' }).then(resp => {
            if (!resp.ok) {
                throw new Error('HTTP ' + resp.status);
            }
            return resp.text();
        });
    }

    /**
     * 跨域二进制请求（基础设施，保留在主脚本）
     */
    function fetchCrossOriginBinary(url, options = {}) {
        if (!url) {
            return Promise.reject(new Error('無效的請求地址'));
        }
        const headers = {
            'Referer': options.referer || 'https://www.rmdown.com/',
            ...(options.headers || {})
        };
        const method = options.method || 'GET';
        if (typeof GM_xmlhttpRequest === 'function') {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method,
                    url,
                    headers,
                    responseType: 'arraybuffer',
                    onload: (resp) => {
                        if (resp.status >= 200 && resp.status < 400) {
                            resolve({
                                buffer: resp.response,
                                headers: resp.responseHeaders || ''
                            });
                        } else {
                            reject(new Error('HTTP ' + resp.status));
                        }
                    },
                    onerror: () => reject(new Error('網絡錯誤')),
                    ontimeout: () => reject(new Error('請求超時'))
                });
            });
        }
        return fetch(url, {
            method,
            headers,
            credentials: 'include'
        }).then(async (resp) => {
            if (!resp.ok) {
                throw new Error('HTTP ' + resp.status);
            }
            const buffer = await resp.arrayBuffer();
            return {
                buffer,
                headers: resp.headers
            };
        });
    }

    // 远程模块加载配置：manifest 地址与本地缓存 key
    const REMOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/truclocphung1713/CLManager/main/manifest.json';
    const REMOTE_MODULE_CACHE_KEY = 'CLM_RemoteModuleCache_v1';
    const AUTO_UPDATE_CHECK_KEY = 'CLM_AutoUpdateCheck';
    const LAST_UPDATE_CHECK_KEY = 'CLM_LastUpdateCheck';
    const AUTO_UPDATE_INTERVAL = 30 * 60 * 1000; // 30 分钟

    function getRemoteModuleCache() {
        const empty = { manifestVersion: '', modules: {} };
        let raw = '';
        try {
            if (typeof GM_getValue === 'function') {
                raw = GM_getValue(REMOTE_MODULE_CACHE_KEY, '');
            } else if (pageWindow.localStorage) {
                raw = pageWindow.localStorage.getItem(REMOTE_MODULE_CACHE_KEY) || '';
            }
        } catch (e) {
            console.warn('草榴Manager: 讀取遠程模塊緩存失敗', e);
            return empty;
        }
        if (!raw) return empty;
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (e) {
            console.warn('草榴Manager: 解析遠程模塊緩存失敗', e);
        }
        return empty;
    }

    function saveRemoteModuleCache(cache) {
        let text;
        try {
            text = JSON.stringify(cache || {});
        } catch (e) {
            console.warn('草榴Manager: 無法序列化遠程模塊緩存', e);
            return;
        }
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(REMOTE_MODULE_CACHE_KEY, text);
            } else if (pageWindow.localStorage) {
                pageWindow.localStorage.setItem(REMOTE_MODULE_CACHE_KEY, text);
            }
        } catch (e) {
            console.warn('草榴Manager: 寫入遠程模塊緩存失敗', e);
        }
    }

    function shouldLoadModuleForPage(manifestEntry, pageType) {
        if (!manifestEntry) return false;
        const targets = manifestEntry.targets;
        if (!targets || !Array.isArray(targets) || !targets.length) {
            return true;
        }
        return targets.indexOf(pageType) !== -1;
    }

    /**
     * 初始化远程模块
     * @param {string} pageType - 页面类型
     * @param {boolean} forceUpdate - 是否强制更新（忽略缓存）
     * @returns {Promise<{success: boolean, updated: boolean, error?: string}>}
     */
    async function initRemoteModules(pageType, forceUpdate = false) {
        const cache = getRemoteModuleCache();
        const result = { success: false, updated: false, error: null };
        
        // 1. 优先使用缓存的模块
        const cachedModules = cache.modules || {};
        const hasCachedModules = Object.keys(cachedModules).length > 0;
        
        // 如果有缓存且不强制更新，先执行缓存的模块
        if (hasCachedModules && !forceUpdate) {
            console.log('草榴Manager: 使用缓存的远程模块 (v' + (cache.manifestVersion || '未知') + ')');
            const modulesToExecute = [];
            Object.keys(cachedModules).forEach((name) => {
                const cached = cachedModules[name];
                if (cached && cached.code) {
                    modulesToExecute.push({ name, code: cached.code });
                }
            });
            
            modulesToExecute.forEach((mod) => {
                try {
                    const fn = new Function('window', '"use strict";\n' + mod.code + '\n//# sourceURL=CLM-remote-module-' + mod.name + '.js');
                    fn(pageWindow);
                    console.log('草榴Manager: 已執行緩存模塊', mod.name);
                } catch (e) {
                    console.error('草榴Manager: 執行緩存模塊出錯', mod.name, e);
                }
            });
            
            result.success = true;
            result.updated = false;
            return result;
        }
        
        // 2. 尝试从 GitHub 获取 manifest
        let manifest = null;
        let fetchError = null;
        
        try {
            const text = await fetchCrossOriginText(REMOTE_MANIFEST_URL);
            manifest = JSON.parse(text);
        } catch (e) {
            fetchError = e;
            console.warn('草榴Manager: 無法從 GitHub 獲取 manifest', e);
        }

        // 3. 如果获取失败，使用缓存
        if (!manifest || !manifest.modules || typeof manifest.modules !== 'object') {
            if (hasCachedModules) {
                console.log('草榴Manager: manifest 獲取失敗，使用緩存模塊');
                const modulesToExecute = [];
                Object.keys(cachedModules).forEach((name) => {
                    const cached = cachedModules[name];
                    if (cached && cached.code) {
                        modulesToExecute.push({ name, code: cached.code });
                    }
                });
                
                modulesToExecute.forEach((mod) => {
                    try {
                        const fn = new Function('window', '"use strict";\n' + mod.code + '\n//# sourceURL=CLM-remote-module-' + mod.name + '.js');
                        fn(pageWindow);
                        console.log('草榴Manager: 已執行緩存模塊', mod.name);
                    } catch (e) {
                        console.error('草榴Manager: 執行緩存模塊出錯', mod.name, e);
                    }
                });
                
                result.success = true;
                result.updated = false;
                result.error = fetchError ? fetchError.message : '无法获取 manifest';
                return result;
            } else {
                result.success = false;
                result.error = '无法获取 manifest 且无缓存可用';
                return result;
            }
        }

        // 4. 检查版本是否需要更新
        const remoteVersion = manifest.version || '';
        const cachedVersion = cache.manifestVersion || '';
        const needsUpdate = forceUpdate || !cachedVersion || remoteVersion !== cachedVersion;
        
        if (!needsUpdate) {
            console.log('草榴Manager: 远程版本 (' + remoteVersion + ') 与缓存版本一致，使用缓存');
            const modulesToExecute = [];
            Object.keys(cachedModules).forEach((name) => {
                const cached = cachedModules[name];
                if (cached && cached.code) {
                    modulesToExecute.push({ name, code: cached.code });
                }
            });
            
            modulesToExecute.forEach((mod) => {
                try {
                    const fn = new Function('window', '"use strict";\n' + mod.code + '\n//# sourceURL=CLM-remote-module-' + mod.name + '.js');
                    fn(pageWindow);
                    console.log('草榴Manager: 已執行緩存模塊', mod.name);
                } catch (e) {
                    console.error('草榴Manager: 執行緩存模塊出錯', mod.name, e);
                }
            });
            
            result.success = true;
            result.updated = false;
            return result;
        }

        // 5. 需要更新：先下载所有新模块到临时缓存，全部成功后再替换
        console.log('草榴Manager: 檢測到版本更新 (' + cachedVersion + ' → ' + remoteVersion + ')，開始更新模塊...');
        
        const newModules = {};
        const manifestModules = manifest.modules || {};
        let downloadFailed = false;
        let failedModules = [];

        for (const name of Object.keys(manifestModules)) {
            const entry = manifestModules[name];
            if (!shouldLoadModuleForPage(entry, pageType)) continue;

            if (!entry.url) {
                console.warn('草榴Manager: 模塊', name, '缺少 URL');
                continue;
            }

            try {
                const code = await fetchCrossOriginText(entry.url);
                newModules[name] = {
                    url: entry.url,
                    code,
                    lastUpdated: Date.now()
                };
                console.log('草榴Manager: 已下載模塊', name);
            } catch (e) {
                console.error('草榴Manager: 下載模塊失敗', name, e);
                downloadFailed = true;
                failedModules.push(name);
            }
        }

        // 6. 如果有模块下载失败，使用旧缓存
        if (downloadFailed) {
            console.warn('草榴Manager: 部分模塊下載失敗 (' + failedModules.join(', ') + ')，使用緩存模塊');
            
            if (hasCachedModules) {
                const modulesToExecute = [];
                Object.keys(cachedModules).forEach((name) => {
                    const cached = cachedModules[name];
                    if (cached && cached.code) {
                        modulesToExecute.push({ name, code: cached.code });
                    }
                });
                
                modulesToExecute.forEach((mod) => {
                    try {
                        const fn = new Function('window', '"use strict";\n' + mod.code + '\n//# sourceURL=CLM-remote-module-' + mod.name + '.js');
                        fn(pageWindow);
                        console.log('草榴Manager: 已執行緩存模塊', mod.name);
                    } catch (e) {
                        console.error('草榴Manager: 執行緩存模塊出錯', mod.name, e);
                    }
                });
                
                result.success = true;
                result.updated = false;
                result.error = '部分模块下载失败，使用缓存';
                return result;
            }
        }

        // 7. 所有模块下载成功，保存新缓存并执行
        const newCache = {
            manifestVersion: remoteVersion,
            modules: newModules,
            lastUpdated: Date.now()
        };
        
        saveRemoteModuleCache(newCache);
        console.log('草榴Manager: 已更新模塊緩存到版本', remoteVersion);

        const modulesToExecute = [];
        Object.keys(newModules).forEach((name) => {
            const mod = newModules[name];
            if (mod && mod.code) {
                modulesToExecute.push({ name, code: mod.code });
            }
        });

        modulesToExecute.forEach((mod) => {
            try {
                const fn = new Function('window', '"use strict";\n' + mod.code + '\n//# sourceURL=CLM-remote-module-' + mod.name + '.js');
                fn(pageWindow);
                console.log('草榴Manager: 已執行新模塊', mod.name);
            } catch (e) {
                console.error('草榴Manager: 執行新模塊出錯', mod.name, e);
            }
        });

        result.success = true;
        result.updated = true;
        return result;
    }

    function extractFilenameFromContentDisposition(headerValue) {
        if (!headerValue) return '';
        let matched = headerValue.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
        if (matched && matched[1]) {
            try {
                return decodeURIComponent(matched[1].trim().replace(/["']/g, ''));
            } catch (err) {
                return matched[1].trim().replace(/["']/g, '');
            }
        }
        matched = headerValue.match(/filename="([^"]+)"/i);
        if (matched && matched[1]) {
            return matched[1].trim();
        }
        matched = headerValue.match(/filename=([^;]+)/i);
        if (matched && matched[1]) {
            return matched[1].trim().replace(/["']/g, '');
        }
        return '';
    }

    function extractFilenameFromHeaders(headers) {
        if (!headers) return '';
        if (typeof headers === 'string') {
            const lines = headers.split(/\r?\n/);
            for (const line of lines) {
                if (!line) continue;
                if (line.toLowerCase().startsWith('content-disposition')) {
                    const value = line.split(':').slice(1).join(':').trim();
                    return extractFilenameFromContentDisposition(value);
                }
            }
            return '';
        }
        if (typeof headers.get === 'function') {
            const value = headers.get('content-disposition');
            return extractFilenameFromContentDisposition(value || '');
        }
        return '';
    }

    function ensureArrayBuffer(data) {
        if (!data) return null;
        if (data instanceof ArrayBuffer) {
            return data;
        }
        if (ArrayBuffer.isView(data)) {
            return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        }
        return null;
    }

    function gmCompatibleFetch(url, options = {}) {
        const method = options.method || 'GET';
        const headers = options.headers ? { ...options.headers } : {};
        let body = options.body;
        if (body instanceof URLSearchParams) {
            if (!headers['Content-Type'] && !headers['content-type']) {
                headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
            }
            body = body.toString();
        }
        if (typeof GM_xmlhttpRequest !== 'function') {
            return fetch(url, {
                ...options,
                method,
                headers,
                body
            });
        }
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url,
                headers,
                data: body,
                timeout: options.timeout || 20000,
                anonymous: options.credentials === 'omit',
                responseType: options.responseType || 'text',
                onload: (resp) => {
                    const responseText = resp.responseText ?? '';
                    resolve({
                        ok: resp.status >= 200 && resp.status < 300,
                        status: resp.status,
                        statusText: resp.statusText || '',
                        headers: resp.responseHeaders || '',
                        text: () => Promise.resolve(responseText),
                        json: () => Promise.resolve(responseText ? JSON.parse(responseText) : null)
                    });
                },
                onerror: (resp) => {
                    reject(new Error(resp?.statusText || '網絡錯誤'));
                },
                ontimeout: () => reject(new Error('請求超時'))
            });
        });
    }

    const href = location.href;

    const threadDataCache = new Map();
    let currentListHoverCtx = null;
    let gallerySourceHighlight = null;

    function setCurrentListHover(ctx) {
        currentListHoverCtx = ctx;
    }

    function clearGallerySourceHighlight() {
        if (gallerySourceHighlight?.element && gallerySourceHighlight.className) {
            try {
                gallerySourceHighlight.element.classList.remove(gallerySourceHighlight.className);
            } catch (err) {
                // 元素可能已被移除，忽略錯誤
            }
        }
        gallerySourceHighlight = null;
    }

    function applyGallerySourceHighlight(ctx) {
        if (!ctx || !ctx.threadUrl) {
            clearGallerySourceHighlight();
            return;
        }
        let target = null;
        let className = '';
        if (ctx.source === 'board' && ctx.cover instanceof HTMLElement) {
            target = ctx.cover;
            className = 'clm-gallery-focus-cover';
        } else if (ctx.source === 'search' && ctx.titleEl instanceof HTMLElement) {
            target = ctx.titleEl;
            className = 'clm-gallery-focus-title';
        }
        if (!target || !className) {
            clearGallerySourceHighlight();
            return;
        }
        clearGallerySourceHighlight();
        target.classList.add(className);
        gallerySourceHighlight = { element: target, className, threadUrl: ctx.threadUrl };
    }

    function focusGallerySource(threadUrl, ctxOverride = null) {
        if (!threadUrl) {
            clearGallerySourceHighlight();
            return;
        }
        const normalizedTarget = normalizeThreadKey(threadUrl);
        if (!normalizedTarget) {
            clearGallerySourceHighlight();
            return;
        }
        let candidate = ctxOverride;
        if (!candidate || normalizeThreadKey(candidate.threadUrl) !== normalizedTarget) {
            if (currentListHoverCtx && normalizeThreadKey(currentListHoverCtx.threadUrl) === normalizedTarget) {
                candidate = currentListHoverCtx;
            }
        }
        if (candidate) {
            applyGallerySourceHighlight(candidate);
        } else {
            clearGallerySourceHighlight();
        }
    }

    function getAbsoluteUrl(url, base = location.href) {
        if (!url) return null;
        try {
            return new URL(url, base).href;
        } catch (e) {
            console.warn('clm 無法解析 URL', url, e);
            return null;
        }
    }

    function normalizeThreadKey(threadUrl) {
        const abs = getAbsoluteUrl(threadUrl);
        if (!abs) return null;
        try {
            const u = new URL(abs);
            u.hash = '';
            return u.href;
        } catch (e) {
            return abs;
        }
    }

    const GALLERY_VISITED_STORAGE_KEY = '草榴ManagerGalleryVisited';
    const MAX_GALLERY_VISITED_ENTRIES = 400;
    let galleryVisitedCache = null;

    function loadGalleryVisitedRecords() {
        try {
            const raw = localStorage.getItem(GALLERY_VISITED_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    return parsed;
                }
            }
        } catch (err) {
            console.warn('草榴Manager: 無法讀取畫廊歷史記錄', err);
        }
        return {};
    }

    function getGalleryVisitedRecords() {
        if (!galleryVisitedCache) {
            galleryVisitedCache = loadGalleryVisitedRecords();
        }
        return galleryVisitedCache;
    }

    function persistGalleryVisitedRecords() {
        if (!galleryVisitedCache) {
            galleryVisitedCache = {};
        }
        try {
            localStorage.setItem(GALLERY_VISITED_STORAGE_KEY, JSON.stringify(galleryVisitedCache));
        } catch (err) {
            console.warn('草榴Manager: 無法保存畫廊歷史記錄', err);
        }
    }

    function pruneGalleryVisitedRecords(records) {
        const keys = Object.keys(records);
        if (keys.length <= MAX_GALLERY_VISITED_ENTRIES) {
            return [];
        }
        const sorted = keys.sort((a, b) => (records[b] || 0) - (records[a] || 0));
        const removed = [];
        for (let i = MAX_GALLERY_VISITED_ENTRIES; i < sorted.length; i++) {
            const key = sorted[i];
            removed.push(key);
            delete records[key];
        }
        return removed;
    }

    function resolveThreadKey(keyOrUrl) {
        if (!keyOrUrl) return null;
        if (
            keyOrUrl.startsWith('http://') ||
            keyOrUrl.startsWith('https://') ||
            keyOrUrl.startsWith('//') ||
            keyOrUrl.startsWith('/')
        ) {
            return normalizeThreadKey(keyOrUrl);
        }
        return keyOrUrl;
    }

    function hasGalleryVisitedThread(keyOrUrl) {
        const threadKey = resolveThreadKey(keyOrUrl);
        if (!threadKey) return false;
        const records = getGalleryVisitedRecords();
        return !!records[threadKey];
    }

    function applyVisitedStateToElement(el, visited) {
        if (!el || !el.dataset) return;
        const variant = el.dataset.clmGalleryVisitedVariant;
        if (!variant) return;
        if (variant === 'cover') {
            el.classList.toggle('clm-gallery-visited-cover', !!visited);
        } else if (variant === 'title') {
            el.classList.toggle('clm-gallery-visited-title', !!visited);
        }
    }

    function refreshGalleryVisitedStateForKey(threadKey) {
        if (!threadKey) return;
        const visited = hasGalleryVisitedThread(threadKey);
        document.querySelectorAll('[data-clm-gallery-visited-variant]').forEach((el) => {
            if (el.dataset.clmThreadKey === threadKey) {
                applyVisitedStateToElement(el, visited);
            }
        });
    }

    function bindGalleryVisitedIndicator(element, threadUrl, variant) {
        if (!element || !threadUrl) return null;
        const threadKey = normalizeThreadKey(threadUrl);
        if (!threadKey) return null;
        element.dataset.clmThreadKey = threadKey;
        if (variant) {
            element.dataset.clmGalleryVisitedVariant = variant;
        }
        applyVisitedStateToElement(element, hasGalleryVisitedThread(threadKey));
        return threadKey;
    }

    function markThreadGalleryVisited(threadUrl) {
        const threadKey = normalizeThreadKey(threadUrl);
        if (!threadKey) return;
        const records = getGalleryVisitedRecords();
        records[threadKey] = Date.now();
        const removedKeys = pruneGalleryVisitedRecords(records);
        persistGalleryVisitedRecords();
        refreshGalleryVisitedStateForKey(threadKey);
        removedKeys.forEach((key) => refreshGalleryVisitedStateForKey(key));
    }

    function getDownloadRecords() {
        if (!downloadRecordsCache) {
            downloadRecordsCache = loadDownloadRecordsFromStorage();
        }
        return downloadRecordsCache;
    }

    function loadDownloadRecordsFromStorage() {
        try {
            const raw = localStorage.getItem(DOWNLOAD_RECORDS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    return parsed;
                }
            }
        } catch (err) {
            console.warn('草榴Manager: 無法讀取下載記錄', err);
        }
        return {};
    }

    function persistDownloadRecords() {
        if (!downloadRecordsCache) {
            downloadRecordsCache = {};
        }
        try {
            localStorage.setItem(DOWNLOAD_RECORDS_KEY, JSON.stringify(downloadRecordsCache));
        } catch (err) {
            console.warn('草榴Manager: 無法保存下載記錄', err);
        }
    }

    function hasDownloadedThread(threadUrl) {
        const key = normalizeThreadKey(threadUrl);
        if (!key) return false;
        const records = getDownloadRecords();
        return !!records[key];
    }

    function markThreadDownloaded(threadUrl) {
        const key = normalizeThreadKey(threadUrl);
        if (!key) return;
        const records = getDownloadRecords();
        records[key] = Date.now();
        persistDownloadRecords();
        notifyDownloadStatusChange(key);
    }

    function subscribeDownloadStatus(threadUrl, handler) {
        const key = normalizeThreadKey(threadUrl);
        if (!key || typeof handler !== 'function') {
            return () => {};
        }
        if (!downloadStatusListeners.has(key)) {
            downloadStatusListeners.set(key, new Set());
        }
        const listeners = downloadStatusListeners.get(key);
        listeners.add(handler);
        return () => {
            listeners.delete(handler);
            if (!listeners.size) {
                downloadStatusListeners.delete(key);
            }
        };
    }

    function notifyDownloadStatusChange(threadKey) {
        const listeners = downloadStatusListeners.get(threadKey);
        if (!listeners) return;
        listeners.forEach((fn) => {
            try {
                fn(true);
            } catch (err) {
                console.warn('草榴Manager: 下載狀態回調失敗', err);
            }
        });
    }

    const QB_LOG_STORAGE_KEY = '草榴ManagerQbLogs';
    const MAX_QB_LOG_ENTRIES = 80;
    let qbLogCache = null;
    const qbLogSubscribers = new Set();

    function loadQbLogsFromStorage() {
        try {
            const raw = localStorage.getItem(QB_LOG_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            }
        } catch (err) {
            console.warn('草榴Manager: 無法讀取日志', err);
        }
        return [];
    }

    function getQbLogs() {
        if (!qbLogCache) {
            qbLogCache = loadQbLogsFromStorage();
        }
        return qbLogCache;
    }

    function persistQbLogs() {
        if (!qbLogCache) return;
        try {
            localStorage.setItem(QB_LOG_STORAGE_KEY, JSON.stringify(qbLogCache));
        } catch (err) {
            console.warn('草榴Manager: 無法保存日志', err);
        }
    }

    function appendQbLog(message, level = 'info') {
        const logs = getQbLogs();
        logs.push({
            id: Date.now() + '_' + Math.random().toString(16).slice(2),
            time: Date.now(),
            level,
            message
        });
        while (logs.length > MAX_QB_LOG_ENTRIES) {
            logs.shift();
        }
        persistQbLogs();
        qbLogSubscribers.forEach((fn) => {
            try {
                fn(logs.slice());
            } catch (err) {
                console.warn('草榴Manager: 日志訂閱回調失敗', err);
            }
        });
    }

    function clearQbLogs() {
        qbLogCache = [];
        persistQbLogs();
        qbLogSubscribers.forEach((fn) => {
            try {
                fn([]);
            } catch (err) {
                console.warn('草榴Manager: 日志訂閱回調失敗', err);
            }
        });
    }

    function subscribeQbLogs(handler) {
        if (typeof handler !== 'function') {
            return () => {};
        }
        qbLogSubscribers.add(handler);
        return () => {
            qbLogSubscribers.delete(handler);
        };
    }

    function formatLogTime(ts) {
        const date = new Date(ts);
        const pad = (n) => (n < 10 ? '0' + n : '' + n);
        return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    let toastContainer = null;
    let toastStyleInjected = false;

    function ensureToastContainer() {
        if (toastContainer) return toastContainer;
        toastContainer = document.createElement('div');
        toastContainer.className = 'clm-toast-container';
        document.body.appendChild(toastContainer);
        if (!toastStyleInjected) {
            toastStyleInjected = true;
            injectStyle(`
                .clm-toast-container {
                    position: fixed;
                    right: 20px;
                    bottom: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    z-index: 999999 !important;
                    pointer-events: none;
                }
                .clm-toast {
                    min-width: 220px;
                    max-width: 320px;
                    background: rgba(0, 0, 0, 0.8);
                    color: #fff;
                    padding: 10px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
                    transform: translateY(20px);
                    opacity: 0;
                    transition: opacity 0.25s ease, transform 0.25s ease;
                }
                .clm-toast.clm-show {
                    opacity: 1;
                    transform: translateY(0);
                }
                .clm-toast.clm-success {
                    background: rgba(22, 163, 74, 0.95);
                }
                .clm-toast.clm-error {
                    background: rgba(220, 38, 38, 0.95);
                }
                .clm-toast.clm-warning {
                    background: rgba(234, 179, 8, 0.95);
                    color: #1f2937;
                }
            `);
        }
        return toastContainer;
    }

    function showToast(message, type = 'info', duration = 4000) {
        const container = ensureToastContainer();
        const toast = document.createElement('div');
        toast.className = `clm-toast clm-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.add('clm-show');
        });
        setTimeout(() => {
            toast.classList.remove('clm-show');
            setTimeout(() => {
                toast.remove();
            }, 250);
        }, duration);
    }

    function summarizeResource(value, maxLength = 80) {
        if (!value) return '未知資源';
        const str = String(value).trim();
        if (str.length <= maxLength) return str;
        return str.slice(0, maxLength - 3) + '...';
    }

    /**
     * 收集帖子中的画廊图片（已迁移到 core.js）
     * 这里保留代理调用，优先使用远程模块
     */
    function collectGalleryImages(threadContent, baseHref = location.href) {
        if (typeof CLM.collectGalleryImages === 'function') {
            return CLM.collectGalleryImages(threadContent, baseHref);
        }
        console.warn('草榴Manager: collectGalleryImages 未从远程模块加载');
        return [];
    }

    /**
     * 提取清洁的文本内容（已迁移到 core.js）
     * 这里保留代理调用，优先使用远程模块
     */
    function extractCleanText(node) {
        if (typeof CLM.extractCleanText === 'function') {
            return CLM.extractCleanText(node);
        }
        console.warn('草榴Manager: extractCleanText 未从远程模块加载');
        return '';
    }

    /**
     * 从内容元素中提取帖子用户名（已迁移到 core.js）
     * 这里保留代理调用，优先使用远程模块
     */
    function extractPostUser(contentEl) {
        if (typeof CLM.extractPostUser === 'function') {
            return CLM.extractPostUser(contentEl);
        }
        console.warn('草榴Manager: extractPostUser 未从远程模块加载');
        return '';
    }

    /**
     * 解析标题标签（已迁移到 core.js）
     * 这里保留代理调用，优先使用远程模块
     */
    function parseTitleTags(titleText) {
        if (typeof CLM.parseTitleTags === 'function') {
            return CLM.parseTitleTags(titleText);
        }
        console.warn('草榴Manager: parseTitleTags 未从远程模块加载');
        return { quality: null, size: null, code: null, title: '' };
    }

    /**
     * 收集帖子上下文（已迁移到 core.js）
     * 这里保留代理调用，优先使用远程模块
     */
    function collectThreadContext(doc) {
        if (typeof CLM.collectThreadContext === 'function') {
            return CLM.collectThreadContext(doc);
        }
        console.warn('草榴Manager: collectThreadContext 未从远程模块加载');
        return {
            topic: null,
            comments: [],
            ads: []
        };
    }

    /**
     * 收集帖子广告块（已迁移到 core.js）
     */
    function collectThreadAdBlocks(doc) {
        if (typeof CLM.collectThreadAdBlocks === 'function') {
            return CLM.collectThreadAdBlocks(doc);
        }
        console.warn('草榴Manager: collectThreadAdBlocks 未从远程模块加载');
        return [];
    }

    const adScriptCache = new Map();

    function decodeJsStringLiteral(input) {
        if (!input) return '';
        let output = '';
        for (let i = 0; i < input.length; i++) {
            const ch = input[i];
            if (ch !== '\\') {
                output += ch;
                continue;
            }
            i += 1;
            if (i >= input.length) {
                break;
            }
            const next = input[i];
            switch (next) {
                case 'n':
                    output += '\n';
                    break;
                case 'r':
                    output += '\r';
                    break;
                case 't':
                    output += '\t';
                    break;
                case 'b':
                    output += '\b';
                    break;
                case 'f':
                    output += '\f';
                    break;
                case 'v':
                    output += '\v';
                    break;
                case '0':
                    output += '\0';
                    break;
                case '\\':
                    output += '\\';
                    break;
                case '"':
                case '\'':
                case '`':
                    output += next;
                    break;
                case 'x': {
                    const hex = input.slice(i + 1, i + 3);
                    if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                        output += String.fromCharCode(parseInt(hex, 16));
                        i += 2;
                    } else {
                        output += next;
                    }
                    break;
                }
                case 'u': {
                    if (input[i + 1] === '{') {
                        const endBrace = input.indexOf('}', i + 2);
                        if (endBrace !== -1) {
                            const codePointHex = input.slice(i + 2, endBrace);
                            if (/^[0-9a-fA-F]+$/.test(codePointHex)) {
                                output += String.fromCodePoint(parseInt(codePointHex, 16));
                                i = endBrace;
                                break;
                            }
                        }
                    }
                    const hex = input.slice(i + 1, i + 5);
                    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                        output += String.fromCharCode(parseInt(hex, 16));
                        i += 4;
                    } else {
                        output += next;
                    }
                    break;
                }
                default:
                    output += next;
                    break;
            }
        }
        return output;
    }

    function extractSpjsonPayload(scriptText) {
        if (!scriptText) return '';
        const assignMatch = scriptText.match(/(?:var|let|const)?\s*(?:window\.)?\s*spJson\s*=\s*([\s\S]+?);/i);
        if (!assignMatch || !assignMatch[1]) {
            return '';
        }

        function resolveExpression(expr) {
            const trimmed = expr.trim();
            if (!trimmed) {
                return '';
            }
            const literalMatch = trimmed.match(/^(['"`])([\s\S]*)\1$/);
            if (literalMatch) {
                return decodeJsStringLiteral(literalMatch[2]);
            }
            const decodeMatch = trimmed.match(/^decodeURIComponent\s*\(([\s\S]+)\)$/i);
            if (decodeMatch) {
                const inner = resolveExpression(decodeMatch[1]);
                try {
                    return decodeURIComponent(inner);
                } catch (err) {
                    return inner;
                }
            }
            const jsonParseMatch = trimmed.match(/^JSON\.parse\s*\(([\s\S]+)\)$/i);
            if (jsonParseMatch) {
                const inner = resolveExpression(jsonParseMatch[1]);
                try {
                    const parsed = JSON.parse(inner);
                    if (typeof parsed === 'string') {
                        return parsed;
                    }
                    return JSON.stringify(parsed);
                } catch (err) {
                    return inner;
                }
            }
            return '';
        }

        return resolveExpression(assignMatch[1]);
    }

    // 暴露辅助函数到 window 对象，供远程模块使用
    pageWindow.extractSpjsonPayload = extractSpjsonPayload;
    pageWindow.getAbsoluteUrl = getAbsoluteUrl;
    pageWindow.fetchAdScriptSource = null; // 稍后赋值

    /**
     * 获取广告脚本源码（基础设施，保留在主脚本）
     */
    async function fetchAdScriptSource(scriptUrl) {
        if (!scriptUrl) return '';
        if (adScriptCache.has(scriptUrl)) {
            return adScriptCache.get(scriptUrl);
        }
        const requester = (async () => {
            // 直接使用 GM_xmlhttpRequest 避免 CORS 问题
            if (typeof GM_xmlhttpRequest === 'function') {
                return new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: scriptUrl,
                        headers: {
                            'Referer': location.origin
                        },
                        onload: (resp) => {
                            if (resp.status >= 200 && resp.status < 400) {
                                resolve(resp.responseText);
                            } else {
                                reject(new Error('HTTP ' + resp.status));
                            }
                        },
                        onerror: () => reject(new Error('網絡錯誤')),
                        ontimeout: () => reject(new Error('請求超時'))
                    });
                });
            }
            // 如果没有 GM_xmlhttpRequest，尝试使用 fetch（可能会遇到 CORS 问题）
            try {
                const resp = await fetch(scriptUrl, { credentials: 'include' });
                if (!resp.ok) {
                    throw new Error('HTTP ' + resp.status);
                }
                return await resp.text();
            } catch (err) {
                throw err;
            }
        })();
        requester.catch(() => adScriptCache.delete(scriptUrl));
        adScriptCache.set(scriptUrl, requester);
        return requester;
    }

    // 将 fetchAdScriptSource 暴露到 window 对象
    pageWindow.fetchAdScriptSource = fetchAdScriptSource;

    /**
     * 创建 ftad 网格元素（已迁移到 core.js）
     */
    function createFtadGridElement(doc, adEntries) {
        if (typeof CLM.createFtadGridElement === 'function') {
            return CLM.createFtadGridElement(doc, adEntries);
        }
        console.warn('草榴Manager: createFtadGridElement 未从远程模块加载');
        return null;
    }

    /**
     * 创建 spinit 表格元素（已迁移到 core.js）
     */
    function createSpinitTableElement(doc, leftEntry, rightEntry, startIndex = 0) {
        if (typeof CLM.createSpinitTableElement === 'function') {
            return CLM.createSpinitTableElement(doc, leftEntry, rightEntry, startIndex);
        }
        console.warn('草榴Manager: createSpinitTableElement 未从远程模块加载');
        return null;
    }

    /**
     * 从数据恢复广告（已迁移到 core.js）
     */
    function hydrateThreadAdsFromData(doc, adEntries) {
        if (typeof CLM.hydrateThreadAdsFromData === 'function') {
            return CLM.hydrateThreadAdsFromData(doc, adEntries);
        }
        console.warn('草榴Manager: hydrateThreadAdsFromData 未从远程模块加载');
        return false;
    }

    /**
     * 收集广告（带脚本降级）（已迁移到 core.js）
     */
    async function collectThreadAdsWithScriptFallback(doc, baseHref, rawHtml = '') {
        if (typeof CLM.collectThreadAdsWithScriptFallback === 'function') {
            return CLM.collectThreadAdsWithScriptFallback(doc, baseHref, rawHtml);
        }
        console.warn('草榴Manager: collectThreadAdsWithScriptFallback 未从远程模块加载');
        // 降级到直接收集
        if (typeof CLM.collectThreadAdBlocks === 'function') {
            return CLM.collectThreadAdBlocks(doc);
        }
        return [];
    }

    /**
     * 提取帖子下载信息（已迁移到 core.js）
     */
    function extractThreadDownloadInfo(doc, baseHref = location.href) {
        if (typeof CLM.extractThreadDownloadInfo === 'function') {
            return CLM.extractThreadDownloadInfo(doc, baseHref);
        }
        console.warn('草榴Manager: extractThreadDownloadInfo 未从远程模块加载');
        return null;
    }

    async function resolveThreadDownloadTarget(downloadInfo) {
        if (!downloadInfo) {
            throw new Error('沒有可用的下載資訊');
        }
        if (downloadInfo.type !== 'rmdown') {
            throw new Error('未知的下載來源');
        }
        const cacheKey = downloadInfo.pageUrl;
        if (downloadResolveCache.has(cacheKey)) {
            return downloadResolveCache.get(cacheKey);
        }
        const resolver = (async () => {
            const html = await fetchCrossOriginText(downloadInfo.pageUrl);
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const form = doc.querySelector('form#dl');
            if (!form) {
                throw new Error('無法在下載頁中找到目標表單');
            }
            const params = [];
            Array.from(form.elements || []).forEach((el) => {
                if (!el || !el.name) return;
                const value = el.value || '';
                if (!value) return;
                params.push(encodeURIComponent(el.name) + '=' + encodeURIComponent(value));
            });
            if (!params.length) {
                throw new Error('下載表單缺少必需參數');
            }
            const base = new URL('download.php', downloadInfo.pageUrl);
            const separator = base.search ? '&' : '?';
            const downloadUrl = base.origin + base.pathname + separator + params.join('&');
            const { buffer, headers } = await fetchCrossOriginBinary(downloadUrl);
            const torrentBinary = ensureArrayBuffer(buffer);
            if (!torrentBinary || !torrentBinary.byteLength) {
                throw new Error('無法獲取種子文件內容');
            }
            const filename = extractFilenameFromHeaders(headers) || ('rmdown_' + Date.now() + '.torrent');
            return {
                url: downloadUrl,
                filename,
                torrentBinary
            };
        })();
        resolver.catch(() => {
            downloadResolveCache.delete(cacheKey);
        });
        downloadResolveCache.set(cacheKey, resolver);
        return resolver;
    }

    function createGalleryOverlay() {
        injectStyle(`
            .clm-gallery-overlay {
                position: fixed;
                inset: 0;
                background: rgba(10, 10, 20, 0.82);
                display: none;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                gap: 12px;
                z-index: 100000;
                padding: 32px clamp(16px, 4vw, 48px);
            }
            .clm-gallery-overlay.clm-active {
                display: flex;
            }
            .clm-gallery-layout {
                display: grid;
                grid-template-columns: minmax(350px, 30vw) 1fr minmax(350px, 30vw);
                gap: 20px;
                width: min(98vw, 2400px);
                height: calc(100vh - 160px);
                max-height: calc(100vh - 160px);
                align-items: stretch;
            }
            .clm-gallery-viewer-column {
                display: flex;
                flex-direction: column;
                gap: 18px;
                height: 100%;
                min-height: 0;
            }
            .clm-gallery-panel {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 12px;
                padding: 16px;
                color: #fff;
                backdrop-filter: blur(4px);
                display: flex;
                flex-direction: column;
                gap: 12px;
                max-height: 100%;
            }
            .clm-gallery-panel-topic {
                max-width: 100%;
            }
            .clm-gallery-panel-comments {
                max-width: 100%;
            }
            .clm-gallery-panel-header {
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 0.05em;
            }
            .clm-gallery-panel-body {
                flex: 1;
                overflow: auto;
                font-size: 13px;
                line-height: 1.5;
                color: rgba(255, 255, 255, 0.92);
            }
            .clm-gallery-panel-body::-webkit-scrollbar {
                width: 6px;
            }
            .clm-gallery-panel-body::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.25);
                border-radius: 3px;
            }
            .clm-panel-entry {
                padding: 8px 10px;
                background: rgba(0, 0, 0, 0.25);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                flex-direction: column;
                gap: 4px;
                margin-bottom: 10px;
                min-width: 0;
            }
            .clm-panel-entry-user {
                font-size: 12px;
                letter-spacing: 0.04em;
                color: rgba(255, 255, 255, 0.75);
            }
            .clm-panel-entry-content {
                font-size: 13px;
                color: #fff;
                white-space: pre-line;
                word-wrap: break-word;
                overflow-wrap: break-word;
                word-break: break-word;
                min-width: 0;
            }
            .clm-panel-entry-content .clm-type-tag {
                display: inline-block;
                padding: 2px 8px;
                margin: 2px 4px 2px 0;
                border-radius: 4px;
                font-size: 11px;
                line-height: 1.4;
            }
            /* 类型标签使用不同颜色 - 基于类名，至少10种颜色循环使用 */
            .clm-panel-entry-content .clm-type-tag.clm-type-tag-color-1 {
                background: rgba(59, 130, 246, 0.2) !important;
                border: 1px solid rgba(59, 130, 246, 0.4) !important;
                color: rgba(147, 197, 253, 0.95) !important;
            }
            .clm-panel-entry-content .clm-type-tag.clm-type-tag-color-2 {
                background: rgba(34, 197, 94, 0.2) !important;
                border: 1px solid rgba(34, 197, 94, 0.4) !important;
                color: rgba(134, 239, 172, 0.95) !important;
            }
            .clm-panel-entry-content .clm-type-tag.clm-type-tag-color-3 {
                background: rgba(249, 115, 22, 0.2) !important;
                border: 1px solid rgba(249, 115, 22, 0.4) !important;
                color: rgba(254, 215, 170, 0.95) !important;
            }
            .clm-panel-entry-content .clm-type-tag.clm-type-tag-color-4 {
                background: rgba(168, 85, 247, 0.2) !important;
                border: 1px solid rgba(168, 85, 247, 0.4) !important;
                color: rgba(221, 214, 254, 0.95) !important;
            }
            .clm-panel-entry-content .clm-type-tag.clm-type-tag-color-5 {
                background: rgba(236, 72, 153, 0.2) !important;
                border: 1px solid rgba(236, 72, 153, 0.4) !important;
                color: rgba(251, 207, 232, 0.95) !important;
            }
            .clm-panel-entry-content .clm-type-tag.clm-type-tag-color-6 {
                background: rgba(6, 182, 212, 0.2) !important;
                border: 1px solid rgba(6, 182, 212, 0.4) !important;
                color: rgba(165, 243, 252, 0.95) !important;
            }
            .clm-panel-entry-content .clm-type-tag.clm-type-tag-color-7 {
                background: rgba(234, 179, 8, 0.2) !important;
                border: 1px solid rgba(234, 179, 8, 0.4) !important;
                color: rgba(253, 224, 71, 0.95) !important;
            }
            .clm-panel-entry-content .clm-type-tag.clm-type-tag-color-8 {
                background: rgba(239, 68, 68, 0.2) !important;
                border: 1px solid rgba(239, 68, 68, 0.4) !important;
                color: rgba(254, 202, 202, 0.95) !important;
            }
            .clm-panel-entry-content .clm-type-tag.clm-type-tag-color-9 {
                background: rgba(99, 102, 241, 0.2) !important;
                border: 1px solid rgba(99, 102, 241, 0.4) !important;
                color: rgba(196, 181, 253, 0.95) !important;
            }
            .clm-panel-entry-content .clm-type-tag.clm-type-tag-color-10 {
                background: rgba(20, 184, 166, 0.2) !important;
                border: 1px solid rgba(20, 184, 166, 0.4) !important;
                color: rgba(153, 246, 228, 0.95) !important;
            }
            /* 出演者标签样式 - 复用类型标签的颜色方案 */
            .clm-panel-entry-content .clm-performer-tag {
                display: inline-block;
                padding: 2px 8px;
                margin: 2px 4px 2px 0;
                border-radius: 4px;
                font-size: 11px;
                line-height: 1.4;
                cursor: pointer;
                user-select: none;
            }
            .clm-panel-entry-content .clm-performer-tag.clm-performer-tag-color-1 {
                background: rgba(59, 130, 246, 0.2) !important;
                border: 1px solid rgba(59, 130, 246, 0.4) !important;
                color: rgba(147, 197, 253, 0.95) !important;
            }
            .clm-panel-entry-content .clm-performer-tag.clm-performer-tag-color-2 {
                background: rgba(34, 197, 94, 0.2) !important;
                border: 1px solid rgba(34, 197, 94, 0.4) !important;
                color: rgba(134, 239, 172, 0.95) !important;
            }
            .clm-panel-entry-content .clm-performer-tag.clm-performer-tag-color-3 {
                background: rgba(249, 115, 22, 0.2) !important;
                border: 1px solid rgba(249, 115, 22, 0.4) !important;
                color: rgba(254, 215, 170, 0.95) !important;
            }
            .clm-panel-entry-content .clm-performer-tag.clm-performer-tag-color-4 {
                background: rgba(168, 85, 247, 0.2) !important;
                border: 1px solid rgba(168, 85, 247, 0.4) !important;
                color: rgba(221, 214, 254, 0.95) !important;
            }
            .clm-panel-entry-content .clm-performer-tag.clm-performer-tag-color-5 {
                background: rgba(236, 72, 153, 0.2) !important;
                border: 1px solid rgba(236, 72, 153, 0.4) !important;
                color: rgba(251, 207, 232, 0.95) !important;
            }
            .clm-panel-entry-content .clm-performer-tag.clm-performer-tag-color-6 {
                background: rgba(6, 182, 212, 0.2) !important;
                border: 1px solid rgba(6, 182, 212, 0.4) !important;
                color: rgba(165, 243, 252, 0.95) !important;
            }
            .clm-panel-entry-content .clm-performer-tag.clm-performer-tag-color-7 {
                background: rgba(234, 179, 8, 0.2) !important;
                border: 1px solid rgba(234, 179, 8, 0.4) !important;
                color: rgba(253, 224, 71, 0.95) !important;
            }
            .clm-panel-entry-content .clm-performer-tag.clm-performer-tag-color-8 {
                background: rgba(239, 68, 68, 0.2) !important;
                border: 1px solid rgba(239, 68, 68, 0.4) !important;
                color: rgba(254, 202, 202, 0.95) !important;
            }
            .clm-panel-entry-content .clm-performer-tag.clm-performer-tag-color-9 {
                background: rgba(99, 102, 241, 0.2) !important;
                border: 1px solid rgba(99, 102, 241, 0.4) !important;
                color: rgba(196, 181, 253, 0.95) !important;
            }
            .clm-panel-entry-content .clm-performer-tag.clm-performer-tag-color-10 {
                background: rgba(20, 184, 166, 0.2) !important;
                border: 1px solid rgba(20, 184, 166, 0.4) !important;
                color: rgba(153, 246, 228, 0.95) !important;
            }
            .clm-panel-entry-content .clm-performer-tag:hover {
                opacity: 0.8;
            }
            .clm-panel-entry-title {
                font-size: 16px;
                font-weight: 600;
                color: #fff;
                margin-bottom: 12px;
                line-height: 1.5;
            }
            .clm-panel-entry-title-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-bottom: 8px;
            }
            .clm-panel-entry-title-tag {
                display: inline-block;
                padding: 4px 10px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 500;
                line-height: 1.4;
            }
            /* 清晰度标签 - 绿色 */
            .clm-title-tag-quality {
                background: rgba(34, 197, 94, 0.25);
                border: 1px solid rgba(34, 197, 94, 0.5);
                color: rgba(134, 239, 172, 1);
            }
            /* 文件大小标签 - 橙色 */
            .clm-title-tag-size {
                background: rgba(249, 115, 22, 0.25);
                border: 1px solid rgba(249, 115, 22, 0.5);
                color: rgba(254, 215, 170, 1);
            }
            /* 番号标签 - 紫色，嵌套结构 */
            .clm-title-tag-code {
                background: rgba(168, 85, 247, 0.25);
                border: 1px solid rgba(168, 85, 247, 0.5);
                color: rgba(221, 214, 254, 1);
            }
            /* 番号标签前缀部分 - 更深的紫色背景 */
            .clm-title-tag-code-prefix {
                display: inline-block;
                background: rgba(168, 85, 247, 0.5);
                padding: 4px 6px;
                margin: -4px 4px -4px -10px;
                border-radius: 6px 0 0 6px;
                font-weight: 600;
                cursor: pointer;
            }
            .clm-title-tag-code-prefix:hover {
                background: rgba(168, 85, 247, 0.7);
            }
            /* 番号标签后缀部分 - 可点击，搜索完整番号 */
            .clm-title-tag-code-suffix {
                display: inline-block;
                padding: 4px 6px;
                margin: -4px -10px -4px 4px;
                border-radius: 0 6px 6px 0;
                transition: background 0.2s ease;
            }
            .clm-title-tag-code-suffix:hover {
                background: rgba(168, 85, 247, 0.4);
            }
            /* 搜索弹窗样式 */
            .clm-search-dialog-mask {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 100003;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .clm-search-dialog {
                background: #fff;
                border-radius: 8px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                width: min(600px, 90vw);
                max-height: 85vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .clm-search-dialog-header {
                padding: 14px 18px;
                border-bottom: 1px solid #e5e7eb;
                background: #f9fafb;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .clm-search-dialog-title {
                font-weight: 600;
                font-size: 15px;
                color: #111827;
            }
            .clm-search-dialog-close {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: #6b7280;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
            }
            .clm-search-dialog-close:hover {
                background: #e5e7eb;
                color: #111827;
            }
            .clm-search-dialog-body {
                padding: 18px;
                overflow-y: auto;
                flex: 1;
            }
            .clm-search-form-row {
                margin-bottom: 16px;
            }
            .clm-search-form-row:last-child {
                margin-bottom: 0;
            }
            .clm-search-form-label {
                display: block;
                font-weight: 600;
                font-size: 13px;
                color: #374151;
                margin-bottom: 6px;
            }
            .clm-search-form-label.required::after {
                content: ' *';
                color: #dc2626;
            }
            .clm-search-form-select,
            .clm-search-form-input {
                width: 100%;
                padding: 6px 10px;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                font-size: 13px;
                box-sizing: border-box;
            }
            .clm-search-form-select:focus,
            .clm-search-form-input:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            .clm-search-form-radio-group {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
            }
            .clm-search-form-radio {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .clm-search-form-radio input[type="radio"] {
                margin: 0;
            }
            .clm-search-form-checkbox {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .clm-search-form-checkbox input[type="checkbox"] {
                margin: 0;
            }
            .clm-search-dialog-footer {
                padding: 12px 18px;
                border-top: 1px solid #e5e7eb;
                background: #f9fafb;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
            .clm-search-btn {
                padding: 8px 20px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                border: none;
                transition: background 0.2s;
            }
            .clm-search-btn-primary {
                background: #3b82f6;
                color: #fff;
            }
            .clm-search-btn-primary:hover {
                background: #2563eb;
            }
            .clm-search-btn-secondary {
                background: #e5e7eb;
                color: #374151;
            }
            .clm-search-btn-secondary:hover {
                background: #d1d5db;
            }
            .clm-type-tag {
                cursor: pointer;
            }
            .clm-type-tag:hover {
                opacity: 0.8;
            }
            .clm-panel-entry-title-text {
                font-size: 16px;
                color: #fff;
                line-height: 1.5;
            }
            .clm-panel-entry-tips {
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                color: #333;
                max-width: 100%;
                overflow: hidden;
                position: relative;
            }
            .clm-panel-entry-tips > div {
                color: #333;
                max-width: 100%;
                overflow: hidden;
            }
            .clm-panel-entry-tips-scale-wrapper {
                width: 100%;
                overflow: hidden;
                transform-origin: top left;
            }
            .clm-panel-entry-tips table {
                width: 100%;
                max-width: 100%;
                color: #333;
                background: #fff;
                table-layout: auto;
                word-break: break-word;
            }
            .clm-panel-entry-tips table td,
            .clm-panel-entry-tips table th {
                color: #333;
                word-break: break-word;
                overflow-wrap: break-word;
            }
            .clm-panel-entry-tips a {
                color: #0b5ed7;
                word-break: break-all;
            }
            .clm-panel-empty {
                padding: 12px;
                text-align: center;
                color: rgba(255, 255, 255, 0.6);
                font-size: 13px;
            }
            /* 手机端评论面板中的空状态提示：白底下使用深色文字，避免看不清 */
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-empty {
                color: #666 !important;
            }
            .clm-gallery-viewer {
                position: relative;
                max-width: 100%;
                width: 100%;
                flex: 1;
                min-height: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 16px;
                border-radius: 12px;
                background: rgba(0, 0, 0, 0.35);
                overflow: hidden;
            }
            .clm-gallery-viewer img {
                max-width: 100%;
                max-height: 100%;
                width: auto;
                height: auto;
                object-fit: contain;
                border-radius: 8px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                background: #000;
                transition: opacity 0.2s ease;
                transform-origin: center center;
                cursor: zoom-in;
            }
            .clm-gallery-viewer img.clm-zoomed {
                cursor: move;
            }
            .clm-gallery-ads-slot {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .clm-gallery-ads-slot-viewer-top,
            .clm-gallery-ads-slot-viewer-bottom {
                width: 100%;
            }
            .clm-gallery-ads-title {
                font-size: 12px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: rgba(255, 255, 255, 0.68);
                margin-bottom: 4px;
            }
            .clm-gallery-ads {
                background: rgba(255, 255, 255, 0.96);
                color: #111;
                border-radius: 10px;
                padding: 12px;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 16px 32px rgba(0, 0, 0, 0.35);
                overflow: hidden;
            }
            /* 手机端：让 clm-gallery-ads 变成透明容器，内部 ftad-ct 完全使用 mob_style.css 原生样式 */
            body.clm-mobile-gallery .clm-gallery-ads {
                background: transparent !important;
                box-shadow: none !important;
                padding: 0 !important;
                border-radius: 0 !important;
            }
            .clm-gallery-ads .sptable_info {
                display: none;
            }
            .clm-viewer-loading img {
                opacity: 0;
            }
            .clm-gallery-loading-indicator {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                color: rgba(255, 255, 255, 0.9);
                letter-spacing: 0.08em;
                background: linear-gradient(135deg, rgba(0,0,0,0.35), rgba(0,0,0,0.15));
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.2s ease;
                pointer-events: none;
            }
            .clm-viewer-loading .clm-gallery-loading-indicator {
                opacity: 1;
                visibility: visible;
            }
            .clm-gallery-arrow {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                background: rgba(0, 0, 0, 0.55);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.25);
                border-radius: 50%;
                width: 44px;
                height: 44px;
                font-size: 22px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s ease;
            }
            .clm-gallery-arrow:hover {
                background: rgba(0, 0, 0, 0.85);
            }
            .clm-gallery-arrow-left {
                left: -22px;
            }
            .clm-gallery-arrow-right {
                right: -22px;
            }
            .clm-gallery-close {
                position: absolute;
                top: 16px;
                right: 24px;
                background: rgba(0, 0, 0, 0.55);
                color: #fff;
                border: none;
                font-size: 26px;
                cursor: pointer;
                padding: 4px 10px;
                border-radius: 6px;
            }
            .clm-gallery-meta {
                color: #f5f5f5;
                font-size: 14px;
                text-align: center;
            }
            .clm-gallery-hint {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.65);
            }
            .clm-gallery-actions {
                width: min(98vw, 1600px);
                display: flex;
                justify-content: center;
                gap: 12px;
                position: relative;
                z-index: 100010;
            }
            .clm-gallery-download-preview {
                position: fixed;
                inset: clamp(24px, 6vw, 64px);
                background: #fff;
                border-radius: 14px;
                box-shadow: 0 30px 60px rgba(0, 0, 0, 0.35);
                display: none;
                flex-direction: column;
                z-index: 100010;
                pointer-events: auto;
                overflow: hidden;
            }
            .clm-gallery-download-preview.clm-active {
                display: flex;
            }
            .clm-gallery-download-preview-subtitle {
                font-size: 12px;
                color: #6b7280;
                margin-top: 2px;
            }
            .clm-gallery-download-preview-subtitle:empty {
                display: none;
            }
            .clm-gallery-download-preview-header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px 18px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.08);
                background: linear-gradient(90deg, #f7f8fb, #ffffff);
            }
            .clm-gallery-download-preview-title {
                font-weight: 600;
                font-size: 14px;
                color: #0e0f1a;
            }
            .clm-gallery-download-preview-link {
                margin-left: auto;
                font-size: 12px;
                color: #0b5ed7;
                text-decoration: none;
            }
            .clm-gallery-download-preview-close {
                border: none;
                background: #0d1117;
                color: #fff;
                font-size: 12px;
                border-radius: 20px;
                padding: 6px 14px;
                cursor: pointer;
            }
            .clm-gallery-download-preview-close:hover {
                background: #272c34;
            }
            .clm-gallery-download-preview-frame {
                flex: 1;
                border: none;
                width: 100%;
                min-height: 60vh;
                background: #fff;
            }
            .clm-gallery-download-preview-footer {
                padding: 10px 18px;
                font-size: 12px;
                color: rgba(0, 0, 0, 0.6);
                border-top: 1px solid rgba(0, 0, 0, 0.05);
                background: #fafafa;
            }
            .clm-download-window-mask {
                position: fixed;
                inset: 0;
                background: rgba(8, 8, 12, 0.65);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 100120;
                padding: clamp(16px, 4vw, 48px);
                transition: opacity 0.2s ease, visibility 0.2s ease;
            }
            .clm-download-window-mask.clm-active {
                display: flex;
            }
            .clm-download-window-status {
                font-size: 12px;
                color: rgba(0, 0, 0, 0.65);
                line-height: 1.5;
            }
            .clm-download-window-status[data-variant="success"] {
                color: #059669;
            }
            .clm-download-window-status[data-variant="error"] {
                color: #b91c1c;
            }
            .clm-gallery-download-btn {
                padding: 10px 20px;
                border-radius: 999px;
                border: 1px solid rgba(255, 255, 255, 0.35);
                background: rgba(0, 0, 0, 0.45);
                color: #fff;
                font-size: 13px;
                letter-spacing: 0.08em;
                cursor: pointer;
                transition: background 0.2s ease, opacity 0.2s ease;
                min-width: 220px;
            }
            .clm-gallery-download-btn:hover:not(:disabled) {
                background: rgba(0, 0, 0, 0.75);
            }
            .clm-gallery-download-btn.clm-downloaded {
                border-color: rgba(16, 185, 129, 0.7);
                background: rgba(16, 185, 129, 0.22);
                color: #d1fae5;
            }
            .clm-gallery-download-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .clm-preset-picker-mask {
                position: fixed;
                inset: 0;
                background: transparent;
                z-index: 100120;
                display: flex;
                align-items: flex-end;
                justify-content: flex-end;
            }
            .clm-preset-picker {
                width: min(360px, 90vw);
                max-height: 80vh;
                background: #fff;
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
                overflow: hidden;
                margin: 20px;
            }
            .clm-preset-picker-title {
                padding: 14px 18px;
                font-weight: 600;
                border-bottom: 1px solid #eee;
            }
            .clm-preset-picker-list {
                padding: 12px 18px;
                overflow: auto;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .clm-preset-picker-option {
                border: 1px solid #d0d0d0;
                border-radius: 8px;
                padding: 10px 12px;
                text-align: left;
                background: #fdfdfd;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                gap: 4px;
                transition: border-color 0.2s ease, background 0.2s ease;
            }
            .clm-preset-picker-option:hover {
                background: #f3f6ff;
                border-color: #8da9ff;
            }
            .clm-preset-picker-option strong {
                font-size: 13px;
            }
            .clm-preset-picker-option span {
                font-size: 12px;
                color: #555;
                word-break: break-all;
            }
            .clm-preset-picker-cancel {
                border: none;
                border-top: 1px solid #eee;
                background: #fafafa;
                padding: 10px 0;
                cursor: pointer;
                font-size: 13px;
            }
            .clm-preset-picker-cancel:hover {
                background: #f0f0f0;
            }
            @media (max-width: 1800px) {
                .clm-gallery-overlay {
                    transform: scale(0.9);
                    transform-origin: center center;
                }
            }
            @media (max-width: 1600px) {
                .clm-gallery-overlay {
                    transform: scale(0.85);
                    transform-origin: center center;
                }
                .clm-gallery-layout {
                    grid-template-columns: minmax(320px, 16.67vw) 1fr minmax(320px, 16.67vw);
                    width: min(98vw, 2200px);
                }
            }
            @media (max-width: 1400px) {
                .clm-gallery-overlay {
                    transform: scale(0.8);
                    transform-origin: center center;
                }
                .clm-gallery-layout {
                    grid-template-columns: minmax(300px, 16.67vw) 1fr minmax(300px, 16.67vw);
                    width: min(98vw, 2000px);
                }
            }
            @media (max-width: 1200px) {
                .clm-gallery-overlay {
                    transform: scale(0.75);
                    transform-origin: center center;
                }
                .clm-gallery-layout {
                    grid-template-columns: minmax(280px, 16.67vw) 1fr minmax(280px, 16.67vw);
                    width: min(98vw, 1800px);
                }
            }
            @media (max-width: 1024px) {
                .clm-gallery-overlay {
                    transform: scale(0.7);
                    transform-origin: center center;
                }
                .clm-gallery-layout {
                    grid-template-columns: 1fr;
                }
                .clm-gallery-download-preview {
                    inset: clamp(14px, 4vw, 32px);
                }
            }
        `);

        const overlay = document.createElement('div');
        overlay.className = 'clm-gallery-overlay';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'clm-gallery-close';
        closeBtn.textContent = '✕';

        const layout = document.createElement('div');
        layout.className = 'clm-gallery-layout';

        const topicPanel = document.createElement('section');
        topicPanel.className = 'clm-gallery-panel clm-gallery-panel-topic';
        const topicHeader = document.createElement('div');
        topicHeader.className = 'clm-gallery-panel-header';
        topicHeader.textContent = '主題內容';
        const topicBody = document.createElement('div');
        topicBody.className = 'clm-gallery-panel-body';
        topicPanel.appendChild(topicHeader);
        topicPanel.appendChild(topicBody);
        
        let toggleTopicPanelState = null;

        // 手机端主题内容伸缩功能
        if (isMobilePage()) {
            topicPanel.classList.add('clm-topic-collapsed');

            toggleTopicPanelState = () => {
                const isExpanded = topicPanel.classList.contains('clm-topic-expanded');
                if (isExpanded) {
                    topicPanel.classList.remove('clm-topic-expanded');
                    topicPanel.classList.add('clm-topic-collapsed');
                } else {
                    topicPanel.classList.remove('clm-topic-collapsed');
                    topicPanel.classList.add('clm-topic-expanded');
                }
            };

            topicPanel.addEventListener('click', (e) => {
                // 如果点击的是标签或其他交互元素，不触发伸缩
                if (e.target.closest('.clm-performer-tag') || 
                    e.target.closest('.clm-title-tag-code-prefix') || 
                    e.target.closest('.clm-title-tag-code-suffix')) {
                    return;
                }
                const viewportHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 0;
                if (viewportHeight > 0) {
                    const bottomThreshold = viewportHeight * 0.75;
                    if (e.clientY <= bottomThreshold) {
                        return;
                    }
                }
                if (toggleTopicPanelState) {
                    toggleTopicPanelState();
                }
            });
        }

        const viewer = document.createElement('div');
        viewer.className = 'clm-gallery-viewer';
        const viewerColumn = document.createElement('div');
        viewerColumn.className = 'clm-gallery-viewer-column';

        // 创建viewer上方的广告显示区域
        const viewerAdsTop = document.createElement('div');
        viewerAdsTop.className = 'clm-gallery-ads-slot clm-gallery-ads-slot-viewer-top';
        viewerAdsTop.style.display = 'none';
        const viewerAdsTopTitle = document.createElement('div');
        viewerAdsTopTitle.className = 'clm-gallery-ads-title';
        viewerAdsTopTitle.textContent = '帖子內 AD';
        const viewerAdsTopContainer = document.createElement('div');
        viewerAdsTopContainer.className = 'clm-gallery-ads';
        viewerAdsTop.appendChild(viewerAdsTopTitle);
        viewerAdsTop.appendChild(viewerAdsTopContainer);

        const leftBtn = document.createElement('button');
        leftBtn.type = 'button';
        leftBtn.className = 'clm-gallery-arrow clm-gallery-arrow-left';
        leftBtn.textContent = '‹';

        const rightBtn = document.createElement('button');
        rightBtn.type = 'button';
        rightBtn.className = 'clm-gallery-arrow clm-gallery-arrow-right';
        rightBtn.textContent = '›';

        const viewerImg = document.createElement('img');
        viewerImg.alt = '';
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'clm-gallery-loading-indicator';
        loadingIndicator.textContent = '正在載入…';
        const galleryQualityBadge = document.createElement('div');
        galleryQualityBadge.className = 'clm-quality-badge clm-gallery-quality';
        galleryQualityBadge.style.display = 'none';

        viewer.appendChild(leftBtn);
        viewer.appendChild(viewerImg);
        viewer.appendChild(rightBtn);
        viewer.appendChild(loadingIndicator);
        viewer.appendChild(galleryQualityBadge);

        // 创建viewer下方的广告显示区域
        const viewerAdsBottom = document.createElement('div');
        viewerAdsBottom.className = 'clm-gallery-ads-slot clm-gallery-ads-slot-viewer-bottom';
        viewerAdsBottom.style.display = 'none';
        const viewerAdsBottomTitle = document.createElement('div');
        viewerAdsBottomTitle.className = 'clm-gallery-ads-title';
        viewerAdsBottomTitle.textContent = '帖子內 AD';
        const viewerAdsBottomContainer = document.createElement('div');
        viewerAdsBottomContainer.className = 'clm-gallery-ads';
        viewerAdsBottom.appendChild(viewerAdsBottomTitle);
        viewerAdsBottom.appendChild(viewerAdsBottomContainer);

        viewerColumn.appendChild(viewerAdsTop);
        viewerColumn.appendChild(viewer);
        viewerColumn.appendChild(viewerAdsBottom);

        const commentsPanel = document.createElement('section');
        commentsPanel.className = 'clm-gallery-panel clm-gallery-panel-comments';
        
        const commentsHeader = document.createElement('div');
        commentsHeader.className = 'clm-gallery-panel-header';
        commentsHeader.textContent = '評論內容';
        
        // 手机端评论弹窗头部关闭按钮（参照手机端画廊.html）
        let mobileCommentCloseBtn = null;
        if (isMobilePage()) {
            mobileCommentCloseBtn = document.createElement('span');
            mobileCommentCloseBtn.className = 'clm-mobile-comment-close';
            mobileCommentCloseBtn.textContent = '×';
            commentsHeader.appendChild(mobileCommentCloseBtn);
        }
        
        const commentsBody = document.createElement('div');
        commentsBody.className = 'clm-gallery-panel-body';
        commentsPanel.appendChild(commentsHeader);
        commentsPanel.appendChild(commentsBody);
        
        // 只在手机端添加评论触发按钮（右侧胶囊按钮，参照手机端画廊.html）
        let mobileCommentBtn = null;
        if (isMobilePage()) {
            mobileCommentBtn = document.createElement('button');
            mobileCommentBtn.type = 'button';
            mobileCommentBtn.className = 'clm-mobile-comment-btn clm-comment-trigger';
            mobileCommentBtn.innerHTML = ''
                + '<svg class="comment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 '
                + '8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 '
                + '8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 '
                + '0 0 1 8 8v.5z"></path></svg>'
                + '<span class="comment-label">评论</span>';
            mobileCommentBtn.title = '查看评论';
            overlay.appendChild(mobileCommentBtn);
        }
        
        // 手机端评论按钮/关闭按钮点击事件
        if (mobileCommentBtn) {
            let commentsExpanded = false;
            const closeComments = () => {
                commentsExpanded = false;
                commentsPanel.classList.remove('clm-comments-expanded');
            };
            const openComments = () => {
                commentsExpanded = true;
                commentsPanel.classList.add('clm-comments-expanded');
            };
            
            mobileCommentBtn.addEventListener('click', (e) => {
                // 避免点击事件冒泡到图片 viewer，导致误触翻页
                e.stopPropagation();
                if (commentsExpanded) {
                    closeComments();
                } else {
                    openComments();
                }
            });
            
            if (mobileCommentCloseBtn) {
                mobileCommentCloseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeComments();
                });
            }

            // 手机端：点击评论面板外区域关闭评论内容
            overlay.addEventListener('click', (e) => {
                if (!commentsExpanded) return;
                const target = e.target;
                // 点击在评论面板内部或评论按钮本身时不关闭
                if (target.closest('.clm-gallery-panel-comments') || target.closest('.clm-mobile-comment-btn')) {
                    return;
                }
                closeComments();
                // 避免事件继续冒泡到 viewer 引发翻页
                e.stopPropagation();
            });
        }

        layout.appendChild(topicPanel);
        layout.appendChild(viewerColumn);
        layout.appendChild(commentsPanel);
        
        // 添加点击图片左右区域翻页 + 抽屉点击外部关闭
        viewer.addEventListener('click', (e) => {
            if (!document.body.classList.contains('clm-mobile-gallery')) return;
            
            const target = e.target;

            // 评论面板、评论按钮、关闭按钮、上方广告区域：不处理
            if (target.closest('.clm-gallery-panel-comments') || 
                target.closest('.clm-mobile-comment-btn') ||
                target.closest('.clm-gallery-close') ||
                target.closest('.clm-gallery-ads-slot-viewer-top')) {
                return;
            }

            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 0;
            const isTopicExpanded = topicPanel.classList.contains('clm-topic-expanded');

            // 展开状态：点击抽屉以外区域关闭抽屉
            if (isTopicExpanded && !target.closest('.clm-gallery-panel-topic')) {
                if (toggleTopicPanelState) {
                    console.log('草榴Manager: 点击抽屉外区域，收起主题抽屉');
                    toggleTopicPanelState();
                }
                return;
            }

            // 折叠状态：底部 1/4 区域点击打开抽屉
            if (!isTopicExpanded && toggleTopicPanelState && viewportHeight > 0) {
                const bottomThreshold = viewportHeight * 0.75; // 自上而下 75% 以上即底部 1/4
                if (e.clientY > bottomThreshold) {
                    console.log('草榴Manager: 底部区域点击，切换主题抽屉');
                    toggleTopicPanelState();
                    return;
                }
            }
            
            // 获取点击位置用于左右翻页
            const rect = viewer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const viewerWidth = rect.width;
            
            console.log('草榴Manager: 点击位置', clickX, viewerWidth);
            
            // 左侧1/3区域 - 上一张
            if (clickX < viewerWidth / 3) {
                console.log('草榴Manager: 点击左侧区域，显示上一张');
                galleryOverlay.showPrev();
                showTapIndicator('left');
            }
            // 右侧1/3区域 - 下一张
            else if (clickX > viewerWidth * 2 / 3) {
                console.log('草榴Manager: 点击右侧区域，显示下一张');
                galleryOverlay.showNext();
                showTapIndicator('right');
            }
        }, { passive: false });
        
        // 点击指示器
        function showTapIndicator(side) {
            const indicator = document.createElement('div');
            indicator.className = 'clm-tap-indicator';
            indicator.style.cssText = `
                position: fixed;
                ${side === 'left' ? 'left: 20px' : 'right: 20px'};
                top: 50%;
                transform: translateY(-50%);
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                pointer-events: none;
                z-index: 100005;
                animation: tapFade 0.4s ease-out;
            `;
            indicator.innerHTML = side === 'left' ? '◀' : '▶';
            indicator.style.display = 'flex';
            indicator.style.alignItems = 'center';
            indicator.style.justifyContent = 'center';
            indicator.style.fontSize = '24px';
            indicator.style.color = '#fff';
            
            document.body.appendChild(indicator);
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 400);
        }

        const meta = document.createElement('div');
        meta.className = 'clm-gallery-meta';

        const actions = document.createElement('div');
        actions.className = 'clm-gallery-actions';
        const downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'clm-gallery-download-btn';
        // 这里不能直接使用稍后声明的全局 const isMobile，否则会触发 TDZ
        // 改为直接调用 isMobilePage() 进行判断
        downloadBtn.textContent = isMobilePage() ? '下载' : '打開下載頁面';
        downloadBtn.disabled = true;
        actions.appendChild(downloadBtn);

        const hint = document.createElement('div');
        hint.className = 'clm-gallery-hint';
        hint.textContent = '← → 切換 · Esc 關閉';

        overlay.appendChild(closeBtn);
        overlay.appendChild(layout);
        overlay.appendChild(meta);
        overlay.appendChild(actions);
        overlay.appendChild(hint);

        document.body.appendChild(overlay);

        let items = [];
        let currentIndex = 0;
        let currentImageToken = 0;
        let errorIndicatorTimer = null;
        let currentDownloadInfo = null;
        let currentThreadKey = null;
        let currentQualityTag = null;
        let galleryDownloadUnsubscribe = null;
        let imageScale = 1;
        let imageTranslateX = 0;
        let imageTranslateY = 0;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragStartTranslateX = 0;
        let dragStartTranslateY = 0;

        function formatContentWithTags(text) {
            if (!text) return '';
            
            // 转义HTML特殊字符
            const escapeHtml = (str) => {
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
            };
            
            // 按行分割处理
            const lines = text.split('\n');
            const processedLines = lines.map(line => {
                // 检查是否包含类型相关字段（支持多种格式）
                // 匹配：类型、ジャンル（日文"类型"）
                const typeMatch = line.match(/^(.*?(?:类型|ジャンル)[：:])(.+)$/);
                if (typeMatch) {
                    const prefix = typeMatch[1]; // "类型："之前的内容
                    const typeContent = typeMatch[2]; // "类型："之后的内容
                    
                    // 按"｜"或空格分隔类型（优先使用"｜"，如果没有则用空格）
                    let types = [];
                    if (typeContent.includes('｜')) {
                        types = typeContent.split('｜').map(t => t.trim()).filter(t => t);
                    } else {
                        // 按空格分隔，但保留多个连续空格的情况
                        types = typeContent.split(/\s+/).map(t => t.trim()).filter(t => t);
                    }
                    if (types.length > 0) {
                        // 将每个类型转换为标签，根据索引使用不同的颜色类
                        const tags = types.map((type, index) => {
                            // 根据索引选择颜色类（循环使用10种颜色）
                            const colorClass = `clm-type-tag-color-${(index % 10) + 1}`;
                            return `<span class="clm-type-tag ${colorClass}">${escapeHtml(type)}</span>`;
                        }).join('');
                        return escapeHtml(prefix) + tags;
                    }
                }
                // 检查是否包含出演者相关字段（支持多种格式）
                // 匹配：出演者、出演、【出演女優】（日文格式）
                const performerMatch = line.match(/^(.*?(?:出演者|出演|【出演女優】)[：:])(.+)$/);
                if (performerMatch) {
                    const prefix = performerMatch[1]; // "出演者："之前的内容
                    const performerContent = performerMatch[2]; // "出演者："之后的内容
                    
                    // 按"｜"或空格分隔出演者（优先使用"｜"，如果没有则用空格）
                    let performers = [];
                    if (performerContent.includes('｜')) {
                        performers = performerContent.split('｜').map(p => p.trim()).filter(p => p);
                    } else {
                        // 按空格分隔，但保留多个连续空格的情况
                        performers = performerContent.split(/\s+/).map(p => p.trim()).filter(p => p);
                    }
                    if (performers.length > 0) {
                        // 将每个出演者转换为标签，使用独立的类名 clm-performer-tag
                        const tags = performers.map((performer, index) => {
                            // 根据索引选择颜色类（循环使用10种颜色）
                            const colorClass = `clm-performer-tag-color-${(index % 10) + 1}`;
                            return `<span class="clm-performer-tag ${colorClass}">${escapeHtml(performer)}</span>`;
                        }).join('');
                        return escapeHtml(prefix) + tags;
                    }
                }
                // 普通行直接转义
                return escapeHtml(line);
            });
            
            // 用<br>连接所有行
            return processedLines.join('<br>');
        }

        function renderPanelEntries(container, entries, emptyText) {
            container.innerHTML = '';
            if (!entries || !entries.length) {
                const empty = document.createElement('div');
                empty.className = 'clm-panel-empty';
                empty.textContent = emptyText;
                container.appendChild(empty);
                return;
            }
            entries.forEach(entry => {
                const item = document.createElement('div');
                item.className = 'clm-panel-entry';
                const user = document.createElement('div');
                user.className = 'clm-panel-entry-user';
                user.textContent = entry.user || '匿名';
                const content = document.createElement('div');
                content.className = 'clm-panel-entry-content';
                // 使用 innerHTML 来支持标签和换行
                content.innerHTML = formatContentWithTags(entry.content || '（無內容）');
                
                // 为出演者标签添加点击事件（只绑定到出演者标签，不包括类型标签）
                // 等待DOM更新后直接为每个出演者标签绑定事件
                setTimeout(() => {
                    content.querySelectorAll('.clm-performer-tag').forEach(tag => {
                        // 设置样式，确保可以点击
                        tag.style.pointerEvents = 'auto';
                        tag.style.cursor = 'pointer';
                        tag.style.position = 'relative';
                        tag.style.zIndex = '10';
                        
                        // 添加点击事件（使用捕获阶段确保事件被处理）
                        const clickHandler = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation(); // 阻止其他事件监听器
                            const keyword = tag.textContent.trim();
                            console.log('草榴Manager: 点击出演者标签:', keyword);
                            if (keyword) {
                                // 通过全局变量访问searchDialog
                                const dialog = window.clmSearchDialog;
                                console.log('草榴Manager: searchDialog:', dialog);
                                if (dialog && typeof dialog.open === 'function') {
                                    console.log('草榴Manager: 调用 dialog.open:', keyword);
                                    dialog.open(keyword);
                                } else {
                                    console.warn('草榴Manager: searchDialog 未初始化或 open 方法不存在', dialog);
                                }
                            }
                        };
                        tag.addEventListener('click', clickHandler, true); // 使用捕获阶段确保事件被处理
                        tag.addEventListener('mousedown', (e) => {
                            e.stopPropagation();
                        }, true);
                    });
                }, 0);
                
                // 如果有 tips 元素，添加到内容中
                if (entry.tips && entry.tips.length > 0) {
                    const tipsContainer = document.createElement('div');
                    tipsContainer.className = 'clm-panel-entry-tips';
                    const scaleWrapper = document.createElement('div');
                    scaleWrapper.className = 'clm-panel-entry-tips-scale-wrapper';
                    entry.tips.forEach(tipHtml => {
                        const tipDiv = document.createElement('div');
                        tipDiv.innerHTML = tipHtml;
                        scaleWrapper.appendChild(tipDiv);
                    });
                    tipsContainer.appendChild(scaleWrapper);
                    content.appendChild(tipsContainer);
                    
                    // 等比例缩放tips以适应容器宽度
                    setTimeout(() => {
                        const containerWidth = tipsContainer.offsetWidth;
                        const contentWidth = scaleWrapper.scrollWidth;
                        if (contentWidth > containerWidth && containerWidth > 0) {
                            const scale = containerWidth / contentWidth;
                            scaleWrapper.style.transform = `scale(${scale})`;
                            scaleWrapper.style.width = `${100 / scale}%`;
                            // 调整容器高度以适应缩放后的内容
                            const scaledHeight = scaleWrapper.scrollHeight * scale;
                            tipsContainer.style.height = `${scaledHeight}px`;
                        }
                    }, 50);
                }
                
                item.appendChild(user);
                item.appendChild(content);
                container.appendChild(item);
            });
        }


        function renderTopicPanel(topic) {
            topicBody.innerHTML = '';
            
            // 电脑端在header显示"主題內容"，手机端隐藏header
            topicHeader.textContent = '主題內容';
            
            console.log('草榴Manager: renderTopicPanel', topic);
            
            if (!topic) {
                const empty = document.createElement('div');
                empty.className = 'clm-panel-empty';
                empty.textContent = '暫無主題內容';
                topicBody.appendChild(empty);
                return;
            }
            
            const item = document.createElement('div');
            item.className = 'clm-panel-entry';
            
            // 显示标题和标签（在body中显示，电脑端和手机端都一样）
            const titleContainer = document.createElement('div');
            titleContainer.className = 'clm-panel-entry-title';
            
            if (topic.titleInfo && (topic.titleInfo.quality || topic.titleInfo.size || topic.titleInfo.code || topic.titleInfo.title)) {
                // 显示标签（清晰度、文件大小、番号）
                const tagsContainer = document.createElement('div');
                tagsContainer.className = 'clm-panel-entry-title-tags';
                let hasTags = false;
                
                // 清晰度标签
                if (topic.titleInfo.quality) {
                    const qualityTag = document.createElement('span');
                    qualityTag.className = 'clm-panel-entry-title-tag clm-title-tag-quality';
                    qualityTag.textContent = topic.titleInfo.quality;
                    tagsContainer.appendChild(qualityTag);
                    hasTags = true;
                }
                
                // 文件大小标签
                if (topic.titleInfo.size) {
                    const sizeTag = document.createElement('span');
                    sizeTag.className = 'clm-panel-entry-title-tag clm-title-tag-size';
                    sizeTag.textContent = topic.titleInfo.size;
                    tagsContainer.appendChild(sizeTag);
                    hasTags = true;
                }
                
                // 番号标签 - 嵌套结构：外层包裹完整番号，内层包裹前缀
                if (topic.titleInfo.code) {
                    const codeTag = document.createElement('span');
                    codeTag.className = 'clm-panel-entry-title-tag clm-title-tag-code';
                    
                    // 解析番号，分离前缀和后缀（如 UMSO-618 -> UMSO 和 -618）
                    const code = topic.titleInfo.code;
                    const separatorMatch = code.match(/^([A-Z0-9]+)([-_])([0-9]+)$/i);
                    
                    if (separatorMatch) {
                        // 有分隔符的情况：创建嵌套结构
                        const prefix = separatorMatch[1]; // UMSO
                        const separator = separatorMatch[2]; // -
                        const suffix = separatorMatch[3]; // 618
                        
                        const prefixTag = document.createElement('span');
                        prefixTag.className = 'clm-title-tag-code-prefix';
                        prefixTag.textContent = prefix;
                        prefixTag.style.cursor = 'pointer';
                        prefixTag.addEventListener('click', (e) => {
                            e.stopPropagation();
                            // 通过全局变量访问searchDialog
                            const dialog = window.clmSearchDialog;
                            if (dialog) {
                                dialog.open(prefix);
                            }
                        });
                        
                        // 创建后缀标签（可点击，搜索完整番号）
                        const suffixTag = document.createElement('span');
                        suffixTag.className = 'clm-title-tag-code-suffix';
                        suffixTag.textContent = separator + suffix;
                        suffixTag.style.cursor = 'pointer';
                        suffixTag.addEventListener('click', (e) => {
                            e.stopPropagation();
                            // 通过全局变量访问searchDialog
                            const dialog = window.clmSearchDialog;
                            if (dialog && typeof dialog.open === 'function') {
                                dialog.open(code); // 搜索完整番号
                            }
                        });
                        
                        codeTag.appendChild(prefixTag);
                        codeTag.appendChild(suffixTag);
                    } else {
                        // 没有分隔符的情况：直接显示完整番号
                        codeTag.textContent = code;
                    }
                    
                    tagsContainer.appendChild(codeTag);
                    hasTags = true;
                }
                
                if (hasTags) {
                    titleContainer.appendChild(tagsContainer);
                }
                
                // 显示标题文本（片名）
                if (topic.titleInfo.title) {
                    const titleText = document.createElement('div');
                    titleText.className = 'clm-panel-entry-title-text';
                    titleText.textContent = topic.titleInfo.title;
                    titleContainer.appendChild(titleText);
                }
            } else if (topic.rawTitle) {
                // 如果没有 titleInfo，显示原始标题
                const titleText = document.createElement('div');
                titleText.className = 'clm-panel-entry-title-text';
                titleText.textContent = topic.rawTitle;
                titleContainer.appendChild(titleText);
            }
            
            // 只有当有标题内容时才添加到 item
            if (titleContainer.children.length > 0) {
                item.appendChild(titleContainer);
            }
            
            // 显示用户
            const user = document.createElement('div');
            user.className = 'clm-panel-entry-user';
            user.textContent = topic.user || '匿名';
            item.appendChild(user);
            
            // 显示内容
            const content = document.createElement('div');
            content.className = 'clm-panel-entry-content';
            content.innerHTML = formatContentWithTags(topic.content || '（無內容）');
            
            // 为出演者标签添加点击事件（只绑定到出演者标签，不包括类型标签）
            // 等待DOM更新后直接为每个出演者标签绑定事件
            setTimeout(() => {
                content.querySelectorAll('.clm-performer-tag').forEach(tag => {
                    // 设置样式，确保可以点击
                    tag.style.pointerEvents = 'auto';
                    tag.style.cursor = 'pointer';
                    tag.style.position = 'relative';
                    tag.style.zIndex = '10';
                    
                    // 添加点击事件（使用捕获阶段确保事件被处理）
                    const clickHandler = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation(); // 阻止其他事件监听器
                        const keyword = tag.textContent.trim();
                        console.log('草榴Manager: 点击出演者标签:', keyword);
                        if (keyword) {
                            // 通过全局变量访问searchDialog
                            const dialog = window.clmSearchDialog;
                            console.log('草榴Manager: searchDialog:', dialog);
                            if (dialog && typeof dialog.open === 'function') {
                                console.log('草榴Manager: 调用 dialog.open:', keyword);
                                dialog.open(keyword);
                            } else {
                                console.warn('草榴Manager: searchDialog 未初始化或 open 方法不存在', dialog);
                            }
                        }
                    };
                    tag.addEventListener('click', clickHandler, true); // 使用捕获阶段确保事件被处理
                    tag.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                    }, true);
                });
            }, 0);
            
            // 如果有 tips 元素，添加到内容中
            if (topic.tips && topic.tips.length > 0) {
                const tipsContainer = document.createElement('div');
                tipsContainer.className = 'clm-panel-entry-tips';
                const scaleWrapper = document.createElement('div');
                scaleWrapper.className = 'clm-panel-entry-tips-scale-wrapper';
                topic.tips.forEach(tipHtml => {
                    const tipDiv = document.createElement('div');
                    tipDiv.innerHTML = tipHtml;
                    scaleWrapper.appendChild(tipDiv);
                });
                tipsContainer.appendChild(scaleWrapper);
                content.appendChild(tipsContainer);
                
                // 等比例缩放tips以适应容器宽度
                setTimeout(() => {
                    const containerWidth = tipsContainer.offsetWidth;
                    const contentWidth = scaleWrapper.scrollWidth;
                    if (contentWidth > containerWidth && containerWidth > 0) {
                        const scale = containerWidth / contentWidth;
                        scaleWrapper.style.transform = `scale(${scale})`;
                        scaleWrapper.style.width = `${100 / scale}%`;
                        // 调整容器高度以适应缩放后的内容
                        const scaledHeight = scaleWrapper.scrollHeight * scale;
                        tipsContainer.style.height = `${scaledHeight}px`;
                    }
                }, 50);
            }
            
            item.appendChild(content);
            topicBody.appendChild(item);
        }

        function renderCommentsPanel(comments) {
            renderPanelEntries(commentsBody, comments || [], '暫無評論內容');
        }

        function renderViewerAds(ads) {
            if (!ads || !ads.length) {
                viewerAdsTop.style.display = 'none';
                viewerAdsBottom.style.display = 'none';
                return;
            }

            // 调试：输出要渲染的广告
            console.log('clm 渲染广告:', ads.length, ads);

            // 如果有两个或更多广告，第一个显示在上方，第二个显示在下方
            // 如果只有一个广告，显示在上方
            if (ads.length >= 2) {
                viewerAdsTopContainer.innerHTML = ads[0];
                viewerAdsTop.style.display = 'flex';
                viewerAdsBottomContainer.innerHTML = ads[1];
                viewerAdsBottom.style.display = 'flex';
            } else if (ads.length === 1) {
                viewerAdsTopContainer.innerHTML = ads[0];
                viewerAdsTop.style.display = 'flex';
                viewerAdsBottom.style.display = 'none';
            } else {
                viewerAdsTop.style.display = 'none';
                viewerAdsBottom.style.display = 'none';
            }
            
            // 调试：检查渲染后的元素
            setTimeout(() => {
                const topFtad = viewerAdsTopContainer.querySelector('.ftad-ct');
                const bottomFtad = viewerAdsBottomContainer.querySelector('.ftad-ct');
                console.log('clm 渲染后检查:', {
                    topVisible: viewerAdsTop.style.display,
                    topHasFtad: !!topFtad,
                    bottomVisible: viewerAdsBottom.style.display,
                    bottomHasFtad: !!bottomFtad
                });
            }, 100);
        }

        function updateGalleryQuality(tag) {
            currentQualityTag = tag || null;
            updateQualityBadgeElement(galleryQualityBadge, currentQualityTag);
        }

        function beginImageLoad(message) {
            if (errorIndicatorTimer) {
                clearTimeout(errorIndicatorTimer);
                errorIndicatorTimer = null;
            }
            loadingIndicator.textContent = message || '正在載入…';
            viewer.classList.add('clm-viewer-loading');
            updateGalleryQuality(currentQualityTag);
        }

        function finishImageLoad() {
            if (errorIndicatorTimer) {
                clearTimeout(errorIndicatorTimer);
                errorIndicatorTimer = null;
            }
            viewer.classList.remove('clm-viewer-loading');
            loadingIndicator.textContent = '正在載入…';
        }

        function handleImageError() {
            if (errorIndicatorTimer) {
                clearTimeout(errorIndicatorTimer);
            }
            loadingIndicator.textContent = '載入失敗，請稍後重試';
            viewer.classList.add('clm-viewer-loading');
            errorIndicatorTimer = setTimeout(() => {
                viewer.classList.remove('clm-viewer-loading');
                loadingIndicator.textContent = '正在載入…';
                errorIndicatorTimer = null;
            }, 1600);
        }

        function updateMeta() {
            if (!items.length) {
                meta.textContent = '';
                return;
            }
            meta.textContent = `${currentIndex + 1} / ${items.length}　${items[currentIndex]?.label || ''}`;
        }

        function cleanupGalleryDownloadWatcher() {
            if (galleryDownloadUnsubscribe) {
                galleryDownloadUnsubscribe();
                galleryDownloadUnsubscribe = null;
            }
        }

        function refreshOverlayDownloadButton() {
            const hasDownload = currentThreadKey && currentDownloadInfo && currentDownloadInfo.pageUrl;
            if (!hasDownload) {
                downloadBtn.classList.remove('clm-downloaded');
                downloadBtn.disabled = true;
                downloadBtn.textContent = '暫無可下載資源';
                delete downloadBtn.dataset.clmThreadKey;
                downloadBtn.__clmRefreshDownloadState = null;
                return;
            }
            downloadBtn.dataset.clmThreadKey = currentThreadKey;
            downloadBtn.__clmRefreshDownloadState = refreshOverlayDownloadButton;
            const downloaded = hasDownloadedThread(currentThreadKey);
            downloadBtn.classList.toggle('clm-downloaded', downloaded);
            downloadBtn.disabled = false;
            downloadBtn.textContent = downloaded ? '已下載' : (isMobilePage() ? '下载' : '打開下載頁面');
        }

        function updateDownloadAction(downloadInfo) {
            currentDownloadInfo = downloadInfo || null;
            cleanupGalleryDownloadWatcher();
            if (currentThreadKey && currentDownloadInfo && currentDownloadInfo.pageUrl) {
                galleryDownloadUnsubscribe = subscribeDownloadStatus(currentThreadKey, () => refreshOverlayDownloadButton());
            }
            refreshOverlayDownloadButton();
        }

        function handleDownloadClick() {
            if (!downloadBtn.dataset.clmThreadKey) return;
            handleThreadDownloadButtonClick(downloadBtn);
        }

        function resetImageTransform() {
            imageScale = 1;
            imageTranslateX = 0;
            imageTranslateY = 0;
            applyImageTransform();
        }

        function applyImageTransform() {
            viewerImg.style.transform = `translate(${imageTranslateX}px, ${imageTranslateY}px) scale(${imageScale})`;
            viewerImg.classList.toggle('clm-zoomed', imageScale > 1);
        }

        function zoomImage(delta, clientX, clientY) {
            const rect = viewerImg.getBoundingClientRect();
            const imgCenterX = rect.left + rect.width / 2;
            const imgCenterY = rect.top + rect.height / 2;
            
            // 计算鼠标相对于图片中心的位置
            const mouseX = clientX - imgCenterX;
            const mouseY = clientY - imgCenterY;
            
            // 缩放因子：向下滚动（delta > 0）缩小，向上滚动（delta < 0）放大
            const zoomFactor = delta > 0 ? 0.9 : 1.1;
            const newScale = Math.max(1, Math.min(5, imageScale * zoomFactor));
            
            if (newScale === imageScale) return;
            
            // 计算缩放后的偏移，使鼠标位置保持相对不变
            const scaleChange = newScale / imageScale;
            imageTranslateX = mouseX - (mouseX - imageTranslateX) * scaleChange;
            imageTranslateY = mouseY - (mouseY - imageTranslateY) * scaleChange;
            imageScale = newScale;
            
            applyImageTransform();
        }

        function showImage(index) {
            const item = items[index];
            if (!item) return;
            const token = ++currentImageToken;
            resetImageTransform();
            beginImageLoad();
            const targetSrc = item.url;
            viewerImg.onload = () => {
                if (token !== currentImageToken) return;
                finishImageLoad();
                resetImageTransform();
            };
            viewerImg.onerror = () => {
                if (token !== currentImageToken) return;
                handleImageError();
            };
            viewerImg.removeAttribute('src');
            requestAnimationFrame(() => {
                if (token !== currentImageToken) return;
                viewerImg.src = targetSrc;
                viewerImg.alt = item.label || '';
            });
            currentIndex = index;
            updateMeta();
        }

        function showNext() {
            if (items.length <= 1) return;
            const nextIndex = (currentIndex + 1) % items.length;
            showImage(nextIndex);
        }

        function showPrev() {
            if (items.length <= 1) return;
            const prevIndex = (currentIndex - 1 + items.length) % items.length;
            showImage(prevIndex);
        }

        function closeOverlay() {
            overlay.classList.remove('clm-active');
            // 移除手机端特殊class
            document.body.classList.remove('clm-mobile-gallery');
            viewerImg.removeAttribute('src');
            resetImageTransform();
            currentThreadKey = null;
            updateDownloadAction(null);
            updateGalleryQuality(null);
            clearGallerySourceHighlight();
            closeInlineDownloadWindowIfOpen();
        }

        function openLoadingState(message = '正在載入畫廊…') {
            overlay.classList.add('clm-active');
            // 手机端添加特殊class以应用抖音风格样式
            if (isMobilePage()) {
                document.body.classList.add('clm-mobile-gallery');
            }
            items = [];
            currentIndex = 0;
            currentImageToken += 1;
            viewerImg.removeAttribute('src');
            viewerImg.alt = '';
            renderTopicPanel(null);
            renderCommentsPanel([]);
            renderViewerAds([]);
            meta.textContent = '';
            updateGalleryQuality(null);
            currentThreadKey = null;
            updateDownloadAction(null);
            beginImageLoad(message);
            closeInlineDownloadWindowIfOpen();
        }

        function openOverlay(newItems, options = {}) {
            if (!newItems || !newItems.length) return;
            const {
                startIndex = 0,
                topic = null,
                comments = [],
                download = null,
                threadUrl = null,
                qualityTag = null,
                ads = []
            } = options;
            items = newItems;
            currentIndex = Math.min(Math.max(startIndex, 0), items.length - 1);
            overlay.classList.add('clm-active');
            // 手机端添加特殊class以应用抖音风格样式
            if (isMobilePage()) {
                document.body.classList.add('clm-mobile-gallery');
            }
            renderTopicPanel(topic);
            renderCommentsPanel(comments);
            renderViewerAds(ads);
            currentThreadKey = threadUrl ? normalizeThreadKey(threadUrl) : null;
            updateGalleryQuality(qualityTag);
            updateDownloadAction(download);
            showImage(currentIndex);
        }

        // 滚轮放大功能 - 绑定到viewer和图片上（仅电脑端）
        const handleWheel = (ev) => {
            if (!overlay.classList.contains('clm-active')) return;
            if (!viewerImg.src) return;
            // 手机端禁用滚轮缩放
            if (document.body.classList.contains('clm-mobile-gallery')) return;
            
            ev.preventDefault();
            ev.stopPropagation();
            const delta = ev.deltaY;
            zoomImage(delta, ev.clientX, ev.clientY);
        };
        
        viewer.addEventListener('wheel', handleWheel, { passive: false });
        viewerImg.addEventListener('wheel', handleWheel, { passive: false });

        // 拖拽功能（当图片放大时）
        viewerImg.addEventListener('mousedown', (ev) => {
            if (imageScale <= 1) return;
            isDragging = true;
            dragStartX = ev.clientX;
            dragStartY = ev.clientY;
            dragStartTranslateX = imageTranslateX;
            dragStartTranslateY = imageTranslateY;
            viewerImg.style.cursor = 'grabbing';
            ev.preventDefault();
        });

        document.addEventListener('mousemove', (ev) => {
            if (!isDragging || imageScale <= 1) return;
            const deltaX = ev.clientX - dragStartX;
            const deltaY = ev.clientY - dragStartY;
            imageTranslateX = dragStartTranslateX + deltaX;
            imageTranslateY = dragStartTranslateY + deltaY;
            applyImageTransform();
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                if (imageScale > 1) {
                    viewerImg.style.cursor = 'move';
                } else {
                    viewerImg.style.cursor = 'zoom-in';
                }
            }
        });

        // 双击重置缩放
        viewerImg.addEventListener('dblclick', () => {
            resetImageTransform();
        });

        closeBtn.addEventListener('click', () => closeOverlay());
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) {
                closeOverlay();
            }
        });
        leftBtn.addEventListener('click', () => showPrev());
        rightBtn.addEventListener('click', () => showNext());
        downloadBtn.addEventListener('click', () => handleDownloadClick());
        document.addEventListener('keydown', (ev) => {
            if (!overlay.classList.contains('clm-active')) return;
            // 手机端禁用键盘操作
            if (document.body.classList.contains('clm-mobile-gallery')) return;
            if (ev.key === 'ArrowRight') {
                ev.preventDefault();
                showNext();
            } else if (ev.key === 'ArrowLeft') {
                ev.preventDefault();
                showPrev();
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                if (!closeInlineDownloadWindowIfOpen()) {
                    closeOverlay();
                }
            }
        });

        // 手机端触控手势支持（仅在非缩放状态下启用）
        if (isMobilePage()) {
            let touchStartX = 0;
            let touchStartY = 0;
            let touchEndX = 0;
            let touchEndY = 0;
            let initialPinchDistance = 0;
            let isZooming = false;

            viewer.addEventListener('touchstart', (e) => {
                if (!overlay.classList.contains('clm-active')) return;
                // 只在手机端画廊模式下处理触摸事件
                if (!document.body.classList.contains('clm-mobile-gallery')) return;

                // 检查触摸是否在评论面板、按钮或主题面板上
                const target = e.target;
                if (target.closest('.clm-gallery-panel-comments') ||
                    target.closest('.clm-mobile-comment-btn') ||
                    target.closest('.clm-gallery-close') ||
                    target.closest('.clm-gallery-panel-topic') ||
                    target.closest('.clm-gallery-ads-slot-viewer-top')) {
                    return;
                }

                if (e.touches.length === 2) {
                    // 双指触控 - 记录初始距离
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
                    isZooming = true;
                    console.log('草榴Manager: 检测到双指触摸，初始距离:', initialPinchDistance);
                } else if (e.touches.length === 1) {
                    // 单指触控
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                    isZooming = false;
                    console.log('草榴Manager: 触摸开始', touchStartX, touchStartY);
                }
            }, { passive: true });

            viewer.addEventListener('touchmove', (e) => {
                if (!overlay.classList.contains('clm-active')) return;
                if (!document.body.classList.contains('clm-mobile-gallery')) return;

                if (e.touches.length === 2 && initialPinchDistance > 0) {
                    // 双指移动 - 检测缩放
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const currentDistance = Math.sqrt(dx * dx + dy * dy);

                    if (Math.abs(currentDistance - initialPinchDistance) > 10) {
                        isZooming = true;
                        const scale = currentDistance / initialPinchDistance;
                        console.log('草榴Manager: 双指缩放比例:', scale);
                    }
                }
            }, { passive: true });

            viewer.addEventListener('touchend', (e) => {
                if (!overlay.classList.contains('clm-active')) return;
                if (!document.body.classList.contains('clm-mobile-gallery')) return;

                // 检查触摸是否在评论面板、按钮或主题面板上
                const target = e.target;
                if (target.closest('.clm-gallery-panel-comments') ||
                    target.closest('.clm-mobile-comment-btn') ||
                    target.closest('.clm-gallery-close') ||
                    target.closest('.clm-gallery-panel-topic') ||
                    target.closest('.clm-gallery-ads-slot-viewer-top')) {
                    return;
                }

                if (e.touches.length === 0 && !isZooming) {
                    // 单指滑动结束且未缩放
                    touchEndX = e.changedTouches[0].clientX;
                    touchEndY = e.changedTouches[0].clientY;
                    console.log('草榴Manager: 触摸结束', touchEndX, touchEndY);
                    handleGesture();
                }

                if (e.touches.length === 0) {
                    isZooming = false;
                    initialPinchDistance = 0;
                }
            }, { passive: true });

            function handleGesture() {
                const deltaX = touchEndX - touchStartX;
                const deltaY = touchEndY - touchStartY;
                const absDeltaX = Math.abs(deltaX);
                const absDeltaY = Math.abs(deltaY);
                const minSwipeDistance = 80;
                const minVerticalSwipeDistance = 60;

                console.log('草榴Manager: 手势检测 deltaX:', deltaX, 'deltaY:', deltaY);

                const viewportHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 0;
                const isTopicExpanded = topicPanel.classList.contains('clm-topic-expanded');

                // 垂直滑动：控制主题抽屉（仅在底部区域触发）
                if (!isZooming && absDeltaY > absDeltaX && absDeltaY > minVerticalSwipeDistance && viewportHeight > 0) {
                    const startY = touchStartY;
                    const bottomThreshold = viewportHeight * 0.5;
                    if (startY > bottomThreshold && typeof toggleTopicPanelState === 'function') {
                        if (!isTopicExpanded && deltaY < 0) {
                            console.log('草榴Manager: 上滑，展开主题抽屉');
                            toggleTopicPanelState();
                        } else if (isTopicExpanded && deltaY > 0) {
                            console.log('草榴Manager: 下滑，收起主题抽屉');
                            toggleTopicPanelState();
                        }
                    }
                    return;
                }

                // 水平滑动（仅在非缩放状态下）：与点击左右区域方向保持一致
                if (!isZooming && absDeltaX > absDeltaY && absDeltaX > minSwipeDistance) {
                    if (deltaX > 0) {
                        // 向右滑动 - 下一张（与点击右侧区域一致）
                        console.log('草榴Manager: 向右滑动，显示下一张');
                        showNext();
                        showTapIndicator('right');
                    } else {
                        // 向左滑动 - 上一张（与点击左侧区域一致）
                        console.log('草榴Manager: 向左滑动，显示上一张');
                        showPrev();
                        showTapIndicator('left');
                    }
                }
            }
        }

        return {
            open: openOverlay,
            close: closeOverlay,
            isOpen: () => overlay.classList.contains('clm-active'),
            showNext,
            showPrev,
            showLoading: openLoadingState
        };
    }

    /**
     * -------------------------------
     *   搜索功能：点击标签进行搜索
     * -------------------------------
     */

    const SEARCH_SETTINGS_KEY = '草榴ManagerSearchSettings';

    const DEFAULT_SEARCH_SETTINGS = {
        f_fid: '', // 社区分类（必选）
        sch_area: '0', // 搜索帖子范围：0=主题标题, 1=主题标题与主题内容, 2=回复标题与回复内容
        sch_time: 'all', // 发表主题时间
        method: 'AND', // 关键词匹配方式：AND=完全匹配, OR=部分匹配
        orderway: 'postdate', // 结果排序：postdate=发布时间, lastpost=最后回复时间, replies=回复, hits=赞
        asc: 'DESC', // 升序/降序：ASC=升序, DESC=降序
        sch_author: '', // 限定用戶（用戶名）
        digest: false // 精华帖标志
    };

    function loadSearchSettings() {
        try {
            const raw = localStorage.getItem(SEARCH_SETTINGS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return { ...DEFAULT_SEARCH_SETTINGS, ...parsed };
            }
        } catch (e) {
            console.error('草榴Manager: 搜索设置读取失败，使用默认值', e);
        }
        return { ...DEFAULT_SEARCH_SETTINGS };
    }

    function saveSearchSettings(settings) {
        try {
            localStorage.setItem(SEARCH_SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('草榴Manager: 搜索设置保存失败', e);
        }
    }

    function createSearchDialog() {
        const mask = document.createElement('div');
        mask.className = 'clm-search-dialog-mask';
        mask.style.display = 'none';

        const dialog = document.createElement('div');
        dialog.className = 'clm-search-dialog';

        const header = document.createElement('div');
        header.className = 'clm-search-dialog-header';
        const title = document.createElement('div');
        title.className = 'clm-search-dialog-title';
        title.textContent = '搜索选项';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'clm-search-dialog-close';
        closeBtn.textContent = '×';
        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'clm-search-dialog-body';

        // 关键词（必选）
        const keywordRow = document.createElement('div');
        keywordRow.className = 'clm-search-form-row';
        const keywordLabel = document.createElement('label');
        keywordLabel.className = 'clm-search-form-label required';
        keywordLabel.textContent = '关键词';
        const keywordInput = document.createElement('input');
        keywordInput.type = 'text';
        keywordInput.className = 'clm-search-form-input';
        keywordInput.name = 'keyword';
        keywordInput.id = 'sch_keyword';
        keywordInput.placeholder = '請輸入搜索關鍵詞';
        keywordRow.appendChild(keywordLabel);
        keywordRow.appendChild(keywordInput);
        body.appendChild(keywordRow);

        // 社区分类（必选）
        const fidRow = document.createElement('div');
        fidRow.className = 'clm-search-form-row';
        const fidLabel = document.createElement('label');
        fidLabel.className = 'clm-search-form-label required';
        fidLabel.textContent = '社区分类';
        const fidSelect = document.createElement('select');
        fidSelect.className = 'clm-search-form-select';
        fidSelect.name = 'f_fid';
        fidSelect.innerHTML = `
            <option value="">請選擇板塊</option>
            <option value="1">&gt;&gt; BT電影下載</option>
            <option value="2"> &nbsp;|- 亞洲無碼原創區</option>
            <option value="15"> &nbsp;|- 亞洲有碼原創區</option>
            <option value="4"> &nbsp;|- 歐美原創區</option>
            <option value="5"> &nbsp;|- 動漫原創區</option>
            <option value="25"> &nbsp;|- 國產原創區</option>
            <option value="26"> &nbsp;|- 中字原創區</option>
            <option value="28"> &nbsp;|- AI破解原創區</option>
            <option value="27"> &nbsp;|- 綜合分享區</option>
            <option value="21"> &nbsp;|- HTTP下載區</option>
            <option value="22"> &nbsp;|- 在綫成人影院</option>
            <option value="10"> &nbsp;|- 草榴影視庫</option>
            <option value="11"> &nbsp; &nbsp;|-  亞洲區</option>
            <option value="12"> &nbsp; &nbsp;|-  歐美區</option>
            <option value="13"> &nbsp; &nbsp;|-  動漫區</option>
            <option value="14"> &nbsp; &nbsp;|-  圖片區</option>
            <option value="23"> &nbsp; &nbsp;|-  博彩區</option>
            <option value="6">&gt;&gt; 草榴休閑區</option>
            <option value="7"> &nbsp;|- 技術討論區</option>
            <option value="8"> &nbsp;|- 新時代的我們</option>
            <option value="16"> &nbsp;|- 達蓋爾的旗幟</option>
            <option value="20"> &nbsp;|- 成人文學交流區</option>
            <option value="9"> &nbsp;|- 草榴資訊</option>
        `;
        fidRow.appendChild(fidLabel);
        fidRow.appendChild(fidSelect);
        body.appendChild(fidRow);

        // 搜索帖子范围
        const areaRow = document.createElement('div');
        areaRow.className = 'clm-search-form-row';
        const areaLabel = document.createElement('label');
        areaLabel.className = 'clm-search-form-label';
        areaLabel.textContent = '搜索帖子范围';
        const areaGroup = document.createElement('div');
        areaGroup.className = 'clm-search-form-radio-group';
        const area0 = document.createElement('div');
        area0.className = 'clm-search-form-radio';
        area0.innerHTML = '<input type="radio" name="sch_area" value="0" id="sch_area_0" checked><label for="sch_area_0">主题标题</label>';
        areaGroup.appendChild(area0);
        areaRow.appendChild(areaLabel);
        areaRow.appendChild(areaGroup);
        body.appendChild(areaRow);

        // 发表主题时间
        const timeRow = document.createElement('div');
        timeRow.className = 'clm-search-form-row';
        const timeLabel = document.createElement('label');
        timeLabel.className = 'clm-search-form-label';
        timeLabel.textContent = '发表主题时间';
        const timeSelect = document.createElement('select');
        timeSelect.className = 'clm-search-form-select';
        timeSelect.name = 'sch_time';
        timeSelect.innerHTML = `
            <option value="all">所有主题</option>
            <option value="86400">1天内的主题</option>
            <option value="172800">2天内的主题</option>
            <option value="604800">1星期内的主题</option>
            <option value="2592000">1个月内的主题</option>
            <option value="5184000">2个月内的主题</option>
            <option value="7776000">3个月内的主题</option>
            <option value="15552000">6个月内的主题</option>
            <option value="31536000">1年内的主题</option>
        `;
        timeRow.appendChild(timeLabel);
        timeRow.appendChild(timeSelect);
        body.appendChild(timeRow);

        // 关键词匹配方式
        const methodRow = document.createElement('div');
        methodRow.className = 'clm-search-form-row';
        const methodLabel = document.createElement('label');
        methodLabel.className = 'clm-search-form-label';
        methodLabel.textContent = '关键词匹配方式';
        const methodGroup = document.createElement('div');
        methodGroup.className = 'clm-search-form-radio-group';
        const methodAnd = document.createElement('div');
        methodAnd.className = 'clm-search-form-radio';
        methodAnd.innerHTML = '<input type="radio" name="method" value="AND" id="method_and" checked><label for="method_and">完全匹配</label>';
        const methodOr = document.createElement('div');
        methodOr.className = 'clm-search-form-radio';
        methodOr.innerHTML = '<input type="radio" name="method" value="OR" id="method_or"><label for="method_or">部分匹配</label>';
        methodGroup.appendChild(methodAnd);
        methodGroup.appendChild(methodOr);
        methodRow.appendChild(methodLabel);
        methodRow.appendChild(methodGroup);
        body.appendChild(methodRow);

        // 结果排序
        const orderRow = document.createElement('div');
        orderRow.className = 'clm-search-form-row';
        const orderLabel = document.createElement('label');
        orderLabel.className = 'clm-search-form-label';
        orderLabel.textContent = '结果排序';
        const orderSelect = document.createElement('select');
        orderSelect.className = 'clm-search-form-select';
        orderSelect.name = 'orderway';
        orderSelect.style.marginBottom = '8px';
        orderSelect.innerHTML = `
            <option value="postdate">发布时间</option>
            <option value="lastpost">最后回复时间</option>
            <option value="replies">回复</option>
            <option value="hits">赞</option>
        `;
        const ascGroup = document.createElement('div');
        ascGroup.className = 'clm-search-form-radio-group';
        const ascAsc = document.createElement('div');
        ascAsc.className = 'clm-search-form-radio';
        ascAsc.innerHTML = '<input type="radio" name="asc" value="ASC" id="asc_asc"><label for="asc_asc">升序</label>';
        const ascDesc = document.createElement('div');
        ascDesc.className = 'clm-search-form-radio';
        ascDesc.innerHTML = '<input type="radio" name="asc" value="DESC" id="asc_desc" checked><label for="asc_desc">降序</label>';
        ascGroup.appendChild(ascAsc);
        ascGroup.appendChild(ascDesc);
        orderRow.appendChild(orderLabel);
        orderRow.appendChild(orderSelect);
        orderRow.appendChild(ascGroup);
        body.appendChild(orderRow);

        // 限定用戶
        const authorRow = document.createElement('div');
        authorRow.className = 'clm-search-form-row';
        const authorLabel = document.createElement('label');
        authorLabel.className = 'clm-search-form-label';
        authorLabel.textContent = '限定用戶(請輸入用戶名或留空)';
        const authorInput = document.createElement('input');
        authorInput.type = 'text';
        authorInput.className = 'clm-search-form-input';
        authorInput.name = 'pwuser';
        authorInput.id = 'sch_author';
        authorInput.placeholder = '請輸入用戶名或留空';
        authorRow.appendChild(authorLabel);
        authorRow.appendChild(authorInput);
        body.appendChild(authorRow);

        // 精华帖标志
        const digestRow = document.createElement('div');
        digestRow.className = 'clm-search-form-row';
        const digestCheckbox = document.createElement('div');
        digestCheckbox.className = 'clm-search-form-checkbox';
        digestCheckbox.innerHTML = '<input type="checkbox" name="digest" value="1" id="digest_check"><label for="digest_check">精华帖标志</label>';
        digestRow.appendChild(digestCheckbox);
        body.appendChild(digestRow);

        const footer = document.createElement('div');
        footer.className = 'clm-search-dialog-footer';
        const searchBtn = document.createElement('button');
        searchBtn.type = 'button';
        searchBtn.className = 'clm-search-btn clm-search-btn-primary';
        searchBtn.textContent = '搜索';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'clm-search-btn clm-search-btn-secondary';
        cancelBtn.textContent = '取消';
        footer.appendChild(searchBtn);
        footer.appendChild(cancelBtn);

        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        mask.appendChild(dialog);
        document.body.appendChild(mask);

        let currentKeyword = '';
        let currentSearchCallback = null;

        function open(keyword, callback) {
            currentKeyword = keyword;
            currentSearchCallback = callback;
            const settings = loadSearchSettings();
            
            // 设置关键词输入框
            const keywordInput = document.getElementById('sch_keyword');
            if (keywordInput) {
                keywordInput.value = keyword || '';
            }
            
            // 加载保存的设置
            fidSelect.value = settings.f_fid || '';
            
            // 清除所有单选按钮的选中状态
            document.querySelectorAll('input[name="sch_area"]').forEach(radio => {
                radio.checked = false;
            });
            document.querySelectorAll('input[name="method"]').forEach(radio => {
                radio.checked = false;
            });
            document.querySelectorAll('input[name="asc"]').forEach(radio => {
                radio.checked = false;
            });
            
            // 设置选中的单选按钮
            const schAreaRadio = document.querySelector('input[name="sch_area"][value="' + (settings.sch_area || '0') + '"]');
            if (schAreaRadio) schAreaRadio.checked = true;
            
            timeSelect.value = settings.sch_time || 'all';
            
            const methodRadio = document.querySelector('input[name="method"][value="' + (settings.method || 'AND') + '"]');
            if (methodRadio) methodRadio.checked = true;
            
            orderSelect.value = settings.orderway || 'postdate';
            
            const ascRadio = document.querySelector('input[name="asc"][value="' + (settings.asc || 'DESC') + '"]');
            if (ascRadio) ascRadio.checked = true;
            
            const digestCheck = document.getElementById('digest_check');
            if (digestCheck) {
                digestCheck.checked = settings.digest || false;
            }
            
            const authorInput = document.getElementById('sch_author');
            if (authorInput) {
                authorInput.value = settings.sch_author || '';
            }
            
            mask.style.display = 'flex';
        }

        function close() {
            mask.style.display = 'none';
            currentKeyword = '';
            currentSearchCallback = null;
        }

        function performSearch() {
            // 验证必选项
            const keywordInput = document.getElementById('sch_keyword');
            const keyword = keywordInput?.value.trim() || '';
            if (!keyword) {
                alert('请输入关键词（必选项）');
                if (keywordInput) keywordInput.focus();
                return;
            }
            if (!fidSelect.value) {
                alert('请选择社区分类（必选项）');
                fidSelect.focus();
                return;
            }

            // 收集表单数据
            const authorInput = document.getElementById('sch_author');
            const authorValue = authorInput?.value.trim() || '';
            const formData = {
                step: '2',
                s_type: 'forum',
                keyword: keyword,
                f_fid: fidSelect.value,
                sch_area: document.querySelector('input[name="sch_area"]:checked')?.value || '0',
                sch_time: timeSelect.value,
                method: document.querySelector('input[name="method"]:checked')?.value || 'AND',
                orderway: orderSelect.value,
                asc: document.querySelector('input[name="asc"]:checked')?.value || 'DESC',
                pwuser: authorValue,
                digest: document.getElementById('digest_check')?.checked ? '1' : ''
            };

            // 保存设置
            const settings = {
                f_fid: formData.f_fid,
                sch_area: formData.sch_area,
                sch_time: formData.sch_time,
                method: formData.method,
                orderway: formData.orderway,
                asc: formData.asc,
                sch_author: authorValue,
                digest: document.getElementById('digest_check')?.checked || false
            };
            saveSearchSettings(settings);

            // 构建搜索URL
            const params = new URLSearchParams();
            Object.keys(formData).forEach(key => {
                if (formData[key]) {
                    params.append(key, formData[key]);
                }
            });
            const searchUrl = 'https://t66y.com/search.php?' + params.toString();

            // 打开新标签页
            window.open(searchUrl, '_blank');

            // 执行回调
            if (currentSearchCallback) {
                currentSearchCallback();
            }

            close();
        }

        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);
        searchBtn.addEventListener('click', performSearch);
        mask.addEventListener('click', (e) => {
            if (e.target === mask) {
                close();
            }
        });

        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mask.style.display === 'flex') {
                close();
            }
        });

        return {
            open,
            close
        };
    }

    function createInlineDownloadWindow() {
        const mask = document.createElement('div');
        mask.className = 'clm-download-window-mask';
        const preview = document.createElement('div');
        preview.className = 'clm-gallery-download-preview';

        const header = document.createElement('div');
        header.className = 'clm-gallery-download-preview-header';
        const headerMeta = document.createElement('div');
        headerMeta.style.display = 'flex';
        headerMeta.style.flexDirection = 'column';
        headerMeta.style.gap = '2px';
        const title = document.createElement('div');
        title.className = 'clm-gallery-download-preview-title';
        title.textContent = '下載窗口 · RMDOWN';
        const subtitle = document.createElement('div');
        subtitle.className = 'clm-gallery-download-preview-subtitle';
        headerMeta.appendChild(title);
        headerMeta.appendChild(subtitle);

        const link = document.createElement('a');
        link.className = 'clm-gallery-download-preview-link';
        link.textContent = '新窗口開啟';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        // 点击新窗口开启时，关闭下载窗口（避免遮挡）
        link.addEventListener('click', () => {
            close();
        });

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'clm-gallery-download-preview-close';
        closeBtn.textContent = '關閉';

        header.appendChild(headerMeta);
        header.appendChild(link);
        header.appendChild(closeBtn);

        const frame = document.createElement('iframe');
        frame.className = 'clm-gallery-download-preview-frame';
        frame.title = 'RMDOWN 下載內容';
        // 确保 iframe 允许导航，不设置 sandbox 属性以允许所有导航

        const footer = document.createElement('div');
        footer.className = 'clm-gallery-download-preview-footer';
        const status = document.createElement('div');
        status.className = 'clm-download-window-status';
        status.textContent = '準備載入下載頁面…';
        const fallbackHint = document.createElement('div');
        fallbackHint.style.marginTop = '6px';
        fallbackHint.style.fontSize = '11px';
        fallbackHint.style.color = 'rgba(0, 0, 0, 0.45)';
        fallbackHint.textContent = '若頁面無法顯示，請使用新窗口開啟連結。';
        footer.appendChild(status);
        footer.appendChild(fallbackHint);

        preview.appendChild(header);
        preview.appendChild(frame);
        preview.appendChild(footer);

        mask.appendChild(preview);
        document.body.appendChild(mask);

        const state = {
            open: false,
            currentUrl: '',
            loadPromise: null,
            loadResolve: null
        };

        function setTitle(text) {
            title.textContent = text || '下載窗口 · RMDOWN';
        }

        function setSubtitle(text) {
            subtitle.textContent = text || '';
        }

        function setLink(url) {
            if (url) {
                link.href = url;
                link.style.pointerEvents = '';
                link.style.opacity = '';
            } else {
                link.removeAttribute('href');
                link.style.pointerEvents = 'none';
                link.style.opacity = '0.45';
            }
        }

        function setPageUrl(url) {
            state.currentUrl = url || '';
            // 重置加载 Promise
            if (state.loadResolve) {
                state.loadResolve = null;
            }
            state.loadPromise = null;
            
            if (url) {
                // 创建新的 Promise 用于等待加载完成
                state.loadPromise = new Promise((resolve) => {
                    state.loadResolve = resolve;
                });
                
                frame.src = url;
                // 记录初始 URL，用于检测页面跳转
                let initialUrl = url;
                let hasNavigated = false;
                
                // 监听 iframe 加载完成，尝试检测下载链接
                frame.onload = function() {
                    // 检查 iframe 是否发生了跳转（比如跳转到广告页面）
                    // 这是正常行为，当用户点击 DOWNLOAD 后，页面会跳转到广告页面
                    try {
                        const currentUrl = frame.contentWindow.location.href;
                        if (currentUrl !== initialUrl && !currentUrl.includes('rmdown.com')) {
                            // iframe 已跳转到其他页面（可能是广告页面），这是正常行为
                            // 保持窗口打开，让用户看到跳转后的页面
                            hasNavigated = true;
                            setStatus('頁面已跳轉到廣告頁面（正常行為）', 'info');
                            // 通知加载完成
                            if (state.loadResolve) {
                                state.loadResolve();
                                state.loadResolve = null;
                            }
                            return;
                        }
                        // 如果还在 rmdown.com 域名下，检查是否有 poData，以便后续跳转
                        if (currentUrl.includes('rmdown.com')) {
                            try {
                                const iframeWindow = frame.contentWindow;
                                if (typeof iframeWindow.poData !== 'undefined' && Array.isArray(iframeWindow.poData) && iframeWindow.poData.length > 0) {
                                    // poData 存在，跳转应该会在 downloadFile 完成后自动执行
                                    console.log('草榴Manager: 检测到 poData，等待自动跳转');
                                }
                            } catch (e) {
                                // 无法访问 iframe 的 window 对象
                            }
                        }
                    } catch (e) {
                        // 跨域限制，无法访问 location
                        // 这是正常的，当页面跳转到其他域名时会出现跨域限制
                        // 我们假设跳转已经发生，这是正常行为
                        if (!hasNavigated) {
                            // 可能是第一次加载后的跳转，更新状态
                            setStatus('頁面可能已跳轉（跨域限制無法檢測）', 'info');
                        }
                    }
                    
                    // 等待一小段时间，确保页面完全渲染
                    setTimeout(() => {
                        try {
                            // 尝试访问 iframe 内容（可能因跨域限制而失败）
                            const iframeDoc = frame.contentDocument || frame.contentWindow.document;
                            if (iframeDoc) {
                                // 查找所有可能的下载链接
                                const downloadLinks = iframeDoc.querySelectorAll('a[href*="download"], a[href*=".torrent"], button[onclick*="download"], button[onclick*="Download"], form[action*="download"], a[href*=".zip"], a[href*=".rar"], a[href*=".7z"]');
                                downloadLinks.forEach(link => {
                                    // 使用捕获阶段，确保在事件传播前就隐藏窗口
                                    link.addEventListener('click', function(e) {
                                        // 立即隐藏下载窗口，但允许跳转继续
                                        hideForDownload();
                                    }, true); // 使用捕获阶段
                                });
                                
                                // 也监听表单提交（可能用于下载）
                                const forms = iframeDoc.querySelectorAll('form');
                                forms.forEach(form => {
                                    form.addEventListener('submit', function() {
                                        // 立即隐藏下载窗口，但允许提交继续
                                        hideForDownload();
                                    }, true); // 使用捕获阶段
                                });
                                
                                // 监听所有链接点击（更广泛的捕获）
                                iframeDoc.addEventListener('click', function(e) {
                                    const target = e.target;
                                    // 检查是否是下载相关的链接
                                    if (target.tagName === 'A' || target.closest('a')) {
                                        const href = target.href || (target.closest('a')?.href);
                                        if (href && (href.includes('download') || href.includes('.torrent') || href.includes('.zip') || href.includes('.rar') || href.includes('.7z'))) {
                                            // 延迟一点，确保链接能正常触发
                                            setTimeout(() => {
                                                hideForDownload();
                                            }, 100);
                                        }
                                    }
                                }, true);
                                
                                // 监听 DOWNLOAD 按钮点击，确保允许页面跳转
                                // 查找所有按钮，然后筛选出包含 "DOWNLOAD" 文本的按钮
                                const allButtons = iframeDoc.querySelectorAll('button');
                                allButtons.forEach(btn => {
                                    const btnText = btn.textContent || btn.innerText || '';
                                    const btnOnclick = btn.getAttribute('onclick') || '';
                                    const btnTitle = btn.getAttribute('title') || '';
                                    // 检查是否是 DOWNLOAD 按钮
                                    if (btnOnclick.includes('downloadFile') || 
                                        btnTitle.toLowerCase().includes('download') ||
                                        btnText.toUpperCase().includes('DOWNLOAD')) {
                                        btn.addEventListener('click', function(e) {
                                            // 允许点击事件正常传播，不阻止默认行为
                                            // 这样 downloadFile() 函数可以正常执行，包括跳转到广告页面
                                            hideForDownload();
                                        }, false); // 不使用捕获阶段，让事件正常传播
                                    }
                                });
                            }
                        } catch (e) {
                            // 跨域限制，无法访问 iframe 内容
                            // 使用备用方案：监听 iframe 的 beforeunload 事件
                            try {
                                frame.contentWindow.addEventListener('beforeunload', function() {
                                    // 当 iframe 即将卸载时（可能是下载触发或页面跳转），暂时隐藏下载窗口
                                    hideForDownload();
                                });
                            } catch (e2) {
                                // 如果还是失败，忽略
                            }
                        }
                        
                        // 通知加载完成
                        if (state.loadResolve) {
                            state.loadResolve();
                            state.loadResolve = null;
                        }
                    }, 500); // 等待 500ms 确保页面完全加载
                };
            } else {
                frame.removeAttribute('src');
                frame.onload = null;
                // 如果没有 URL，立即 resolve
                if (state.loadResolve) {
                    state.loadResolve();
                    state.loadResolve = null;
                }
            }
        }
        
        function waitForLoad() {
            return state.loadPromise || Promise.resolve();
        }
        
        // 模拟点击 DOWNLOAD 按钮
        function simulateDownloadClick() {
            try {
                const iframeDoc = frame.contentDocument || frame.contentWindow?.document;
                if (!iframeDoc) {
                    // 跨域限制，静默失败
                    return false;
                }
                
                // 查找所有按钮，然后筛选出包含 "DOWNLOAD" 文本的按钮
                const allButtons = iframeDoc.querySelectorAll('button');
                for (const btn of allButtons) {
                    const btnText = btn.textContent || btn.innerText || '';
                    const btnOnclick = btn.getAttribute('onclick') || '';
                    const btnTitle = btn.getAttribute('title') || '';
                    // 检查是否是 DOWNLOAD 按钮
                    if (btnOnclick.includes('downloadFile') || 
                        btnTitle.toLowerCase().includes('download') ||
                        btnText.toUpperCase().includes('DOWNLOAD')) {
                        console.log('草榴Manager: 找到 DOWNLOAD 按钮，正在模拟点击...');
                        // 创建并触发点击事件
                        const clickEvent = new MouseEvent('click', {
                            view: frame.contentWindow,
                            bubbles: true,
                            cancelable: true
                        });
                        btn.dispatchEvent(clickEvent);
                        // 如果按钮有 onclick 属性，也直接调用
                        if (btnOnclick.includes('downloadFile')) {
                            try {
                                // 尝试在 iframe 的 window 上下文中执行 onclick
                                const iframeWindow = frame.contentWindow;
                                if (iframeWindow && typeof iframeWindow.downloadFile === 'function') {
                                    iframeWindow.downloadFile(btn);
                                } else if (btn.onclick) {
                                    btn.onclick();
                                }
                            } catch (e) {
                                console.warn('草榴Manager: 执行 onclick 失败', e);
                            }
                        }
                        hideForDownload();
                        return true;
                    }
                }
                // 未找到 DOWNLOAD 按钮，静默失败
                return false;
            } catch (e) {
                // 跨域错误，静默失败（正常情况，因为 rmdown.com 是跨域 iframe）
                return false;
            }
        }
        
        // 暂时隐藏下载窗口，以便浏览器的文件保存对话框显示在最上层
        function hideForDownload() {
            // 使用 display: none 而不是 visibility，确保完全隐藏
            mask.style.display = 'none';
            mask.style.zIndex = '1'; // 降低 z-index
            // 10秒后恢复显示（给文件保存对话框足够的时间）
            setTimeout(() => {
                if (state.open) {
                    mask.style.display = '';
                    mask.style.zIndex = ''; // 恢复 z-index
                }
            }, 10000);
        }

        function setStatus(text, variant = 'info') {
            status.textContent = text || '準備中…';
            if (variant === 'success' || variant === 'error') {
                status.dataset.variant = variant;
            } else {
                delete status.dataset.variant;
            }
        }

        function open(options = {}) {
            if (!state.open) {
                state.open = true;
                mask.classList.add('clm-active');
            }
            preview.classList.add('clm-active');
            setTitle(options.title || null);
            setSubtitle(options.subtitle || '');
            if (options.pageUrl) {
                setPageUrl(options.pageUrl);
                setLink(options.pageUrl);
            } else if (state.currentUrl) {
                setLink(state.currentUrl);
            } else if (options.link) {
                setLink(options.link);
            } else {
                setLink('');
                setPageUrl('');
            }
            setStatus(options.status || '正在初始化下載窗口…');
        }

        function close() {
            if (!state.open) return;
            state.open = false;
            mask.classList.remove('clm-active');
            preview.classList.remove('clm-active');
            state.currentUrl = '';
            setLink('');
            setStatus('準備載入下載頁面…');
            frame.removeAttribute('src');
            // 重置加载 Promise
            if (state.loadResolve) {
                state.loadResolve = null;
            }
            state.loadPromise = null;
            
            // 重置所有处于忙碌状态的下载按钮
            const busyButtons = document.querySelectorAll('[data-clm-busy="1"]');
            for (const btn of busyButtons) {
                btn.dataset.clmBusy = '0';
                if (typeof btn.__clmRefreshDownloadState === 'function') {
                    btn.__clmRefreshDownloadState();
                } else {
                    btn.disabled = false;
                }
            }
        }

        closeBtn.addEventListener('click', () => close());
        mask.addEventListener('click', (ev) => {
            if (ev.target === mask) {
                close();
            }
        });
        preview.addEventListener('click', (ev) => ev.stopPropagation());
        
        // ESC 键关闭下载窗口
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && state.open) {
                ev.preventDefault();
                ev.stopPropagation();
                close();
            }
        });

        return {
            open,
            close,
            setTitle,
            setSubtitle,
            setLink,
            setPageUrl,
            setStatus,
            waitForLoad,
            simulateDownloadClick,
            isOpen: () => state.open,
            getFrame: () => frame
        };
    }

    const searchDialog = createSearchDialog();
    // 将searchDialog存储到全局变量，以便在闭包中访问
    window.clmSearchDialog = searchDialog;
    const galleryOverlay = createGalleryOverlay();
    const inlineDownloadWindow = createInlineDownloadWindow();
    // 将 inlineDownloadWindow 存储到全局变量，以便在闭包中访问
    window.clmInlineDownloadWindow = inlineDownloadWindow;

    // 暴露 UI 对象和必要函数到 window 对象，供远程模块使用
    pageWindow.galleryOverlay = galleryOverlay;
    pageWindow.inlineDownloadWindow = inlineDownloadWindow;
    pageWindow.searchDialog = searchDialog;
    pageWindow.currentListHoverCtx = currentListHoverCtx;
    pageWindow.focusGallerySource = focusGallerySource;
    pageWindow.clearGallerySourceHighlight = clearGallerySourceHighlight;
    pageWindow.loadSettings = loadSettings;
    pageWindow.openPresetPickerDialog = openPresetPickerDialog;
    pageWindow.resolveThreadDownloadTarget = resolveThreadDownloadTarget;
    pageWindow.sendToQbittorrent = sendToQbittorrent;

    function closeInlineDownloadWindowIfOpen() {
        if (inlineDownloadWindow.isOpen()) {
            inlineDownloadWindow.close();
            return true;
        }
        return false;
    }
    let galleryLoadToken = 0;

    /**
     * 获取帖子数据（已迁移到 core.js）
     */
    async function fetchThreadData(threadUrl) {
        if (typeof CLM.fetchThreadData === 'function') {
            return CLM.fetchThreadData(threadUrl);
        }
        console.warn('草榴Manager: fetchThreadData 未从远程模块加载');
        return null;
    }

    /**
     * 打开帖子画廊（已迁移到 core.js）
     */
    async function openGalleryForThread(threadUrl, options = {}) {
        if (typeof CLM.openGalleryForThread === 'function') {
            return CLM.openGalleryForThread(threadUrl, options);
        }
        console.warn('草榴Manager: openGalleryForThread 未从远程模块加载');
        return null;
    }

    /**
     * 设置帖子下载按钮（已迁移到 core.js）
     */
    function setupThreadDownloadButton(btn, options = {}) {
        if (typeof CLM.setupThreadDownloadButton === 'function') {
            return CLM.setupThreadDownloadButton(btn, options);
        }
        console.warn('草榴Manager: setupThreadDownloadButton 未从远程模块加载');
    }

    /**
     * 处理下载按钮点击（已迁移到 core.js）
     */
    async function handleThreadDownloadButtonClick(btn) {
        if (typeof CLM.handleThreadDownloadButtonClick === 'function') {
            return CLM.handleThreadDownloadButtonClick(btn);
        }
        console.warn('草榴Manager: handleThreadDownloadButtonClick 未从远程模块加载');
    }

    document.addEventListener('keydown', (ev) => {
        if (galleryOverlay.isOpen()) return;
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        if (!currentListHoverCtx || !currentListHoverCtx.threadUrl) return;
        ev.preventDefault();
        openGalleryForThread(currentListHoverCtx.threadUrl, {
            instant: true,
            qualityTag: currentListHoverCtx.qualityTag || null
        });
    });

    injectStyle(`
        .clm-quality-badge {
            position: absolute;
            left: 12px;
            bottom: 12px;
            padding: 3px 8px 4px;
            font-size: 11px;
            line-height: 1.2;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.5);
            background: rgba(12, 12, 20, 0.82);
            color: #fff;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            pointer-events: none;
            display: none;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
            align-items: center;
            justify-content: center;
            min-width: 48px;
            max-width: 80px;
            max-height: 24px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .clm-quality-badge:empty {
            display: none !important;
        }
        #tail .clm-tail-quality {
            left: 12px;
            bottom: 12px;
            top: auto;
            right: auto;
            transform-origin: bottom left;
            transform: translate(
                calc(var(--clm-tail-extra-x, 0px) * -1),
                var(--clm-tail-extra-y, 0px)
            ) scale(var(--clm-tail-scale, 1));
            font-size: 13px;
            padding: 4px 12px 5px;
            min-width: 64px;
        }
        .clm-gallery-quality {
            left: 24px;
            bottom: 24px;
            font-size: 14px;
            padding: 5px 16px 6px;
        }
        .wf_item .image-big.clm-gallery-focus-cover,
        .wf_item .image-big.clm-gallery-focus-cover:hover,
        .wf_item .image-big.clm-gallery-visited-cover,
        .wf_item .image-big.clm-gallery-visited-cover:hover {
            box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.85), 0 0 18px rgba(251, 146, 60, 0.45);
            border-radius: 8px;
        }
        .wf_item .image-big.clm-gallery-focus-cover img,
        .wf_item .image-big.clm-gallery-visited-cover img {
            outline: 3px solid rgba(249, 115, 22, 0.85);
            outline-offset: 2px;
        }
        .clm-gallery-focus-title,
        .clm-gallery-visited-title {
            color: #f97316 !important;
            text-shadow: 0 0 6px rgba(0, 0, 0, 0.35);
            font-weight: 700 !important;
        }
    `);

    /**
     * 从标题检测清晰度标签（已迁移到 core.js）
     */
    function detectQualityTagFromTitle(titleText) {
        if (typeof CLM.detectQualityTagFromTitle === 'function') {
            return CLM.detectQualityTagFromTitle(titleText);
        }
        console.warn('草榴Manager: detectQualityTagFromTitle 未从远程模块加载');
        return null;
    }

    /**
     * 从文档解析清晰度标签（已迁移到 core.js）
     */
    function resolveQualityTagFromDocument(doc) {
        if (typeof CLM.resolveQualityTagFromDocument === 'function') {
            return CLM.resolveQualityTagFromDocument(doc);
        }
        console.warn('草榴Manager: resolveQualityTagFromDocument 未从远程模块加载');
        return null;
    }

    /**
     * 从列表项解析清晰度标签（已迁移到 core.js）
     */
    function resolveQualityTagFromListItem(wfItem, threadAnchor = null) {
        if (typeof CLM.resolveQualityTagFromListItem === 'function') {
            return CLM.resolveQualityTagFromListItem(wfItem, threadAnchor);
        }
        console.warn('草榴Manager: resolveQualityTagFromListItem 未从远程模块加载');
        return null;
    }

    /**
     * 更新品质徽章元素（已迁移到 core.js）
     */
    function updateQualityBadgeElement(badgeEl, tag) {
        if (typeof CLM.updateQualityBadgeElement === 'function') {
            return CLM.updateQualityBadgeElement(badgeEl, tag);
        }
        console.warn('草榴Manager: updateQualityBadgeElement 未从远程模块加载');
        // 降级处理
        if (!badgeEl) return;
        if (tag) {
            badgeEl.textContent = tag.toUpperCase();
            badgeEl.style.display = 'inline-flex';
        } else {
            badgeEl.textContent = '';
            badgeEl.style.display = 'none';
        }
    }

    // 搜索页面（search.php）- 电脑端和手机端通用处理
    if (href.indexOf('search.php') !== -1) {
        const isSearchMobile = isMobilePage();
        
        // 手机端搜索页：缓存电脑端搜索结果，避免重复请求
        let desktopSearchCache = null;
        let desktopSearchPromise = null;
        
        // 将搜索结果转换为类似板块页的卡片布局
        injectStyle(`
            /* 隐藏原有的表格布局 */
            div.t table {
                display: none !important;
            }
            
            /* 创建卡片网格容器 */
            .clm-search-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 16px;
                padding: 16px;
                max-width: 1400px;
                margin: 0 auto;
            }
            
            /* 搜索结果卡片 - 类似wf_item */
            .clm-search-item {
                background: #fff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
                display: flex;
                flex-direction: column;
            }
            
            .clm-search-item:hover {
                transform: translateY(-4px);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            }
            
            /* 封面容器 - 类似image-big */
            .clm-search-cover {
                width: 100%;
                height: 280px;
                background: #f3f4f6;
                position: relative;
                overflow: visible;
                --clm-cover-scale: 1;
            }
            
            .clm-search-cover img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.2s ease-in-out;
                transform-origin: center center;
            }
            
            /* 电脑端封面放大效果 */
            .clm-search-cover:not(.clm-mobile-search):hover img {
                transform: scale(2);
                position: relative;
                z-index: 9999;
                box-shadow: 0 0 16px rgba(0, 0, 0, 0.7);
                border: 2px solid #ffffff;
            }
            
            .clm-search-cover-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                color: #9ca3af;
                font-size: 12px;
                text-align: center;
                padding: 8px;
            }
            /* 搜索页使用与板块页相同的按钮样式 */
            .clm-search-cover .clm-cover-gallery-btn {
                position: absolute;
                left: 50%;
                bottom: 30%;
                transform: translateX(-50%);
                padding: 8px 16px;
                font-size: 13px;
                font-weight: 600;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.6);
                background: rgba(0, 0, 0, 0.50);
                color: #fff;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                z-index: 10;
                white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                transition: background 0.15s ease-in-out;
                pointer-events: auto;
            }
            .clm-search-cover .clm-cover-gallery-btn:hover {
                background: rgba(0, 0, 0, 0.50);
            }
            .clm-search-cover .clm-cover-download {
                position: absolute;
                top: 8px;
                right: 8px;
                padding: 4px 8px;
                font-size: 11px;
                border-radius: 4px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgba(0, 0, 0, 0.7);
                color: #fff;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                z-index: 10;
                transition: background 0.15s ease-in-out;
                pointer-events: auto;
            }
            .clm-search-cover .clm-cover-download.clm-downloaded {
                background: rgba(16, 185, 129, 0.9);
                border-color: rgba(255, 255, 255, 0.55);
            }
            .clm-search-cover .clm-cover-download::before {
                content: '⬇';
                font-size: inherit;
            }
            .clm-search-cover .clm-cover-download:hover {
                background: rgba(0, 0, 0, 0.9);
            }
            .clm-search-cover .clm-cover-quality {
                position: absolute;
                left: 8px;
                top: 8px;
                z-index: 10;
                max-width: 55px;
                font-size: 9px;
                padding: 2px 5px;
                pointer-events: none;
            }
            
            /* 文本信息区域 - 类似wf_text */
            .clm-search-text {
                padding: 12px;
                background: #fff;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .clm-search-title {
                font-size: 14px;
                font-weight: 600;
                color: #1f2937;
                line-height: 1.4;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-overflow: ellipsis;
                margin: 0;
            }
            
            .clm-search-title a {
                color: #1f2937;
                text-decoration: none;
            }
            
            .clm-search-title a:hover {
                color: #3b82f6;
            }
            
            .clm-search-meta {
                font-size: 12px;
                color: #6b7280;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            
            .clm-search-meta span {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            
            .clm-search-item.clm-thread-downloaded {
                background: rgba(34, 197, 94, 0.05);
                border: 2px solid rgba(34, 197, 94, 0.2);
            }
            
            /* 手机端适配 */
            @media (max-width: 768px) {
                .clm-search-grid {
                    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                    gap: 12px;
                    padding: 12px;
                }
                
                .clm-search-cover {
                    height: 200px;
                }
                
                .clm-search-cover:hover img {
                    transform: none !important;
                }
                
                /* 手机端搜索页按钮样式 */
                .clm-search-cover .clm-cover-gallery-btn {
                    padding: 10px 20px;
                    font-size: 15px;
                    bottom: 35%;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                }
                .clm-search-cover .clm-cover-gallery-btn:active {
                    transform: translateX(-50%) scale(0.95);
                }
                .clm-search-cover .clm-cover-download {
                    padding: 6px 12px;
                    font-size: 13px;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                }
                .clm-search-cover .clm-cover-download:active {
                    transform: scale(0.95);
                }
            }
            
            /* 原有的tail预览框样式 */
            #tail {
                /* 保持原站腳本行為，不改位置邏輯，只增加放大效果所需樣式 */
                overflow: visible !important;
                z-index: 9999 !important;
                position: absolute !important;
                --clm-tail-scale: 1;
                --clm-tail-extra-x: 0px;
                --clm-tail-extra-y: 0px;
            }
            #tail img {
                transition: transform 0.2s ease-in-out;
                transform-origin: center center;
                border-radius: 4px;
            }
            #tail:not(.clm-mobile-tail) img:hover,
            #tail.clm-tail-force-zoom:not(.clm-mobile-tail) img {
                transform: scale(2);
                position: relative;
                z-index: 10000;
                box-shadow: 0 0 12px rgba(0, 0, 0, 0.7);
                border: 2px solid #ffffff;
            }
            .clm-title-download {
                margin-left: 8px;
                padding: 2px 6px;
                font-size: 11px;
                border-radius: 4px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgba(0, 0, 0, 0.65);
                color: #fff;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            .clm-title-download.clm-downloaded {
                background: rgba(16, 185, 129, 0.85);
                border-color: rgba(255, 255, 255, 0.6);
                color: #fff;
            }
            tr.tr3.t_one.clm-thread-downloaded {
                background: rgba(34, 197, 94, 0.12);
            }
            .clm-title-download::before {
                content: '⬇';
                font-size: 11px;
            }
            .clm-title-download:hover {
                background: rgba(0, 0, 0, 0.85);
            }
            #tail .clm-tail-quality {
                z-index: 10002;
            }
        `);

        function updateTailQualityFollow() {
            const tail = document.getElementById('tail');
            if (!tail) return;
            const img = tail.querySelector('img');
            if (!img) {
                tail.style.removeProperty('--clm-tail-extra-x');
                tail.style.removeProperty('--clm-tail-extra-y');
                tail.style.removeProperty('--clm-tail-scale');
                return;
            }
            const baseWidth = img.clientWidth || img.naturalWidth;
            const baseHeight = img.clientHeight || img.naturalHeight;
            if (!baseWidth || !baseHeight) return;
            const scaleActive = tail.classList.contains('clm-tail-force-zoom') || tail.matches(':hover');
            const scale = scaleActive ? 2 : 1;
            if (scale <= 1) {
                tail.style.removeProperty('--clm-tail-extra-x');
                tail.style.removeProperty('--clm-tail-extra-y');
                tail.style.removeProperty('--clm-tail-scale');
                return;
            }
            const extraX = (baseWidth * (scale - 1)) / 2;
            const extraY = (baseHeight * (scale - 1)) / 2;
            tail.style.setProperty('--clm-tail-extra-x', `${extraX}px`);
            tail.style.setProperty('--clm-tail-extra-y', `${extraY}px`);
            tail.style.setProperty('--clm-tail-scale', `${scale}`);
        }

        function setTailZoomState(force) {
            const tailEl = document.getElementById('tail');
            if (!tailEl) return null;
            tailEl.classList.toggle('clm-tail-force-zoom', !!force);
            requestAnimationFrame(() => updateTailQualityFollow());
            return tailEl;
        }

        function getTailControls() {
            const tail = document.getElementById('tail');
            if (!tail) return null;

            if (tail.__clmControls) {
                return tail.__clmControls;
            }

            let tailHideTimer = null;

            function cancelHide() {
                if (tailHideTimer) {
                    clearTimeout(tailHideTimer);
                    tailHideTimer = null;
                }
            }

            function scheduleHide() {
                cancelHide();
                tailHideTimer = setTimeout(() => {
                    tail.style.display = 'none';
                    tail.classList.remove('clm-tail-force-zoom');
                    if (currentTailHoverCtx && currentListHoverCtx === currentTailHoverCtx) {
                        setCurrentListHover(null);
                    }
                    currentTailHoverCtx = null;
                    currentTailAnchorEl = null;
                    setTailQualityLabel(null);
                }, 200);
            }

            tail.addEventListener('mouseenter', cancelHide);
            tail.addEventListener('mouseleave', scheduleHide);
            tail.addEventListener('mouseenter', () => {
                if (currentTailHoverCtx) {
                    setCurrentListHover(currentTailHoverCtx);
                    setTailQualityLabel(currentTailHoverCtx.qualityTag || null);
                }
                updateTailQualityFollow();
            });
            tail.addEventListener('mouseleave', () => {
                if (currentTailHoverCtx && currentListHoverCtx === currentTailHoverCtx) {
                    setCurrentListHover(null);
                }
                updateTailQualityFollow();
            });
            tail.addEventListener('load', (ev) => {
                if (ev.target && ev.target.tagName === 'IMG') {
                    updateTailQualityFollow();
                }
            }, true);

            tail.__clmControls = { scheduleHide, cancelHide };
            return tail.__clmControls;
        }

        let currentTailAnchorEl = null;
        let currentTailHoverCtx = null;
        function ensureTailQualityElement() {
            const tail = document.getElementById('tail');
            if (!tail) return null;
            let badge = tail.querySelector('.clm-tail-quality');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'clm-quality-badge clm-tail-quality';
                badge.style.display = 'none';
                tail.appendChild(badge);
            }
            return badge;
        }

        function setTailQualityLabel(tag) {
            const badge = ensureTailQualityElement();
            if (!badge) return;
            updateQualityBadgeElement(badge, tag);
        }

        function adjustTailPositionForElement(anchorEl) {
            const tail = document.getElementById('tail');
            if (!tail || !anchorEl) return;
            const style = window.getComputedStyle(tail);
            if (style.display === 'none') {
                return;
            }
            const anchorRect = anchorEl.getBoundingClientRect();
            const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
            const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
            const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
            const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0;
            const tailRect = tail.getBoundingClientRect();
            let tailWidth = tailRect.width || tail.offsetWidth || 360;
            let tailHeight = tailRect.height || tail.offsetHeight || 240;
            if (!tailWidth) {
                tailWidth = 360;
            }
            if (!tailHeight) {
                tailHeight = 240;
            }
            const viewportLeft = scrollX + 12;
            const viewportRight = scrollX + Math.max(0, viewportWidth) - 12;
            let left = anchorRect.right + scrollX + 12;
            if (left + tailWidth > viewportRight) {
                left = anchorRect.left + scrollX - tailWidth - 12;
            }
            if (left < viewportLeft) {
                left = Math.max(viewportLeft, viewportRight - tailWidth);
            }
            let top = anchorRect.top + scrollY;
            const minTop = scrollY + 12;
            const maxTop = scrollY + Math.max(0, viewportHeight) - tailHeight - 12;
            if (top < minTop) {
                top = minTop;
            }
            if (top > maxTop) {
                top = maxTop;
            }
            tail.style.position = 'absolute';
            tail.style.left = `${Math.round(left)}px`;
            tail.style.top = `${Math.round(top)}px`;
        }

        function scheduleTailPositionUpdate(anchorEl) {
            if (!anchorEl) return;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => adjustTailPositionForElement(anchorEl));
            });
        }

        function refreshTailPositionIfNeeded() {
            if (!currentTailAnchorEl) return;
            adjustTailPositionForElement(currentTailAnchorEl);
            updateTailQualityFollow();
        }

        window.addEventListener('scroll', refreshTailPositionIfNeeded, { passive: true });
        window.addEventListener('resize', refreshTailPositionIfNeeded);

        // 預先嘗試初始化（若 tail 尚未生成，後續 getTailControls 會再處理）
        getTailControls();

        // 将搜索结果转换为卡片布局
        function convertSearchToCards() {
            // 查找表格 - 搜索页的表格在 div.t 里面
            const tableContainer = document.querySelector('div.t');
            if (!tableContainer) return;
            const table = tableContainer.querySelector('table');
            if (!table || table.dataset.clmConverted === '1') return;
            table.dataset.clmConverted = '1';
            
            // 创建卡片网格容器
            const grid = document.createElement('div');
            grid.className = 'clm-search-grid';
            
            // 获取所有搜索结果行 - 搜索页的行只有 tr3 class
            const rows = table.querySelectorAll('tr.tr3');
            
            rows.forEach(async (row) => {
                const link = row.querySelector('a[href]');
                if (!link) return;
                
                const threadUrl = getAbsoluteUrl(link.getAttribute('href') || link.href);
                if (!threadUrl) return;
                
                const threadTitle = link.textContent.trim();
                const qualityTag = detectQualityTagFromTitle(threadTitle);
                
                // 提取其他信息
                const cells = row.querySelectorAll('td');
                let author = '';
                let replies = '';
                let views = '';
                
                if (cells.length >= 4) {
                    author = cells[1]?.textContent.trim() || '';
                    replies = cells[2]?.textContent.trim() || '';
                    views = cells[3]?.textContent.trim() || '';
                }
                
                // 创建卡片
                const card = document.createElement('div');
                card.className = 'clm-search-item';
                
                // 创建封面容器
                const coverDiv = document.createElement('div');
                coverDiv.className = 'clm-search-cover';
                if (isSearchMobile) {
                    coverDiv.classList.add('clm-mobile-search');
                }
                
                // 鼠标悬停时设置CSS变量
                coverDiv.addEventListener('mouseenter', () => {
                    coverDiv.style.setProperty('--clm-cover-scale', '2');
                });
                coverDiv.addEventListener('mouseleave', () => {
                    coverDiv.style.setProperty('--clm-cover-scale', '1');
                });
                
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'clm-search-cover-loading';
                loadingDiv.textContent = '加载中...';
                coverDiv.appendChild(loadingDiv);
                
                // 创建画廊按钮 - 使用与板块页相同的类名
                const galleryBtn = document.createElement('button');
                galleryBtn.type = 'button';
                galleryBtn.className = 'clm-cover-gallery-btn';
                galleryBtn.textContent = '画廊';
                const openGallery = (e) => {
                    if (e) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    openGalleryForThread(threadUrl, { instant: true, qualityTag });
                };
                galleryBtn.addEventListener('click', openGallery);
                coverDiv.appendChild(galleryBtn);
                
                // 创建下载按钮 - 使用与板块页相同的类名
                const downloadBtn = document.createElement('button');
                downloadBtn.type = 'button';
                downloadBtn.className = 'clm-cover-download';
                coverDiv.appendChild(downloadBtn);
                
                // 创建品质徽章 - 使用与板块页相同的类名
                const qualityBadge = document.createElement('div');
                qualityBadge.className = 'clm-quality-badge clm-cover-quality';
                updateQualityBadgeElement(qualityBadge, qualityTag);
                coverDiv.appendChild(qualityBadge);
                
                // 支持方向键进入画廊模式
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                        e.preventDefault();
                        openGallery();
                    }
                });
                // 让卡片可以获得焦点
                card.tabIndex = 0;
                
                // 创建文本信息区域
                const textDiv = document.createElement('div');
                textDiv.className = 'clm-search-text';
                
                const titleDiv = document.createElement('h3');
                titleDiv.className = 'clm-search-title';
                const titleLink = document.createElement('a');
                titleLink.href = threadUrl;
                titleLink.textContent = threadTitle;
                titleLink.target = '_blank';
                titleDiv.appendChild(titleLink);
                
                const metaDiv = document.createElement('div');
                metaDiv.className = 'clm-search-meta';
                if (author) {
                    const authorSpan = document.createElement('span');
                    authorSpan.textContent = `👤 ${author}`;
                    metaDiv.appendChild(authorSpan);
                }
                if (replies) {
                    const repliesSpan = document.createElement('span');
                    repliesSpan.textContent = `💬 ${replies}`;
                    metaDiv.appendChild(repliesSpan);
                }
                if (views) {
                    const viewsSpan = document.createElement('span');
                    viewsSpan.textContent = `👁 ${views}`;
                    metaDiv.appendChild(viewsSpan);
                }
                
                textDiv.appendChild(titleDiv);
                textDiv.appendChild(metaDiv);
                
                // 组装卡片
                card.appendChild(coverDiv);
                card.appendChild(textDiv);
                
                // 设置下载按钮
                setupThreadDownloadButton(downloadBtn, {
                    threadUrl,
                    container: card,
                    containerClass: 'clm-thread-downloaded',
                    label: '⬇',
                    downloadedLabel: '✓',
                    threadTitle
                });
                
                // 绑定画廊访问指示器
                bindGalleryVisitedIndicator(coverDiv, threadUrl, 'cover');
                
                // 添加到网格
                grid.appendChild(card);
                
                // 异步加载封面图 - 优先从[圖]标签获取（仅电脑端有）
                (async () => {
                    try {
                        // 先尝试从[圖]标签获取封面（电脑端）
                        const preSpan = row.querySelector('span.pre[d], span.sgreen.pre[d]');
                        if (preSpan) {
                            const dValue = preSpan.getAttribute('d');
                            if (dValue) {
                                console.log('草榴Manager: 从[圖]标签获取封面:', dValue);
                                // 构建图片URL - 格式: https://a.gac2.xyz/年月/图片ID.jpg
                                const imgUrl = `https://a.gac2.xyz/${dValue}.jpg`;
                                const img = document.createElement('img');
                                img.src = imgUrl;
                                img.alt = threadTitle;
                                img.loading = 'lazy';
                                
                                img.onload = () => {
                                    loadingDiv.remove();
                                    coverDiv.insertBefore(img, coverDiv.firstChild);
                                };
                                
                                img.onerror = async () => {
                                    console.warn('草榴Manager: [圖]封面加载失败，回退到获取帖子内容');
                                    // 如果[圖]加载失败，回退到获取帖子内容
                                    try {
                                        const data = await fetchThreadData(threadUrl);
                                        if (data && data.gallery && data.gallery.length > 0) {
                                            const firstImage = data.gallery[0];
                                            img.src = firstImage.src;
                                        } else {
                                            loadingDiv.textContent = '无图';
                                        }
                                    } catch (err) {
                                        loadingDiv.textContent = '无图';
                                    }
                                };
                                return;
                            }
                        }
                        
                        // 如果没有[圖]标签（手机端），通过切换页面获取电脑端搜索页
                        console.log('草榴Manager: 未找到[圖]标签，尝试从缓存或电脑端获取');
                        
                        try {
                            // 使用缓存或共享的Promise，避免重复请求
                            if (!desktopSearchPromise) {
                                desktopSearchPromise = (async () => {
                                    // 1. 访问切换页面，设置电脑端cookie
                                    console.log('草榴Manager: 切换到电脑端...');
                                    await fetch('https://t66y.com/mobile.php?ismobile=no', {
                                        credentials: 'include'
                                    });
                                    
                                    // 等待300ms让cookie生效
                                    await new Promise(resolve => setTimeout(resolve, 300));
                                    
                                    // 2. 构造电脑端搜索URL
                                    const desktopSearchUrl = window.location.href.replace(/\?.*$/, '') + window.location.search;
                                    console.log('草榴Manager: 获取电脑端搜索页:', desktopSearchUrl);
                                    
                                    // 3. 获取电脑端搜索页HTML
                                    const response = await fetch(desktopSearchUrl, {
                                        credentials: 'include'
                                    });
                                    const html = await response.text();
                                    
                                    // 4. 立即切换回手机端
                                    await fetch('https://t66y.com/mobile.php?ismobile=yes', {
                                        credentials: 'include'
                                    });
                                    
                                    // 5. 解析HTML并缓存
                                    const parser = new DOMParser();
                                    const doc = parser.parseFromString(html, 'text/html');
                                    desktopSearchCache = doc;
                                    return doc;
                                })();
                            }
                            
                            // 等待获取完成
                            const doc = await desktopSearchPromise;
                            
                            // 6. 提取帖子ID用于匹配
                            const threadIdMatch = threadUrl.match(/\/(\d+)\.html$/);
                            const threadId = threadIdMatch ? threadIdMatch[1] : null;
                            
                            // 7. 在电脑端搜索页中查找对应的帖子行
                            const desktopRows = Array.from(doc.querySelectorAll('tr.tr3'));
                            const matchingRow = desktopRows.find(r => {
                                const link = r.querySelector('a[href*="htm_data"], a[href*="htm_mob"]');
                                if (link) {
                                    const linkHref = link.getAttribute('href');
                                    return threadId && linkHref.includes(threadId + '.html');
                                }
                                return false;
                            });
                            
                            if (matchingRow) {
                                const preSpan = matchingRow.querySelector('span.pre[d], span.sgreen.pre[d]');
                                if (preSpan) {
                                    const dValue = preSpan.getAttribute('d');
                                    if (dValue) {
                                        const imgUrl = `https://a.gac2.xyz/${dValue}.jpg`;
                                        const img = document.createElement('img');
                                        img.src = imgUrl;
                                        img.alt = threadTitle;
                                        img.loading = 'lazy';
                                        
                                        img.onload = () => {
                                            loadingDiv.remove();
                                            coverDiv.insertBefore(img, coverDiv.firstChild);
                                        };
                                        
                                        img.onerror = () => {
                                            console.warn('草榴Manager: 电脑端[圖]加载失败，显示无图');
                                            loadingDiv.textContent = '无图';
                                        };
                                        return;
                                    }
                                }
                            }
                            
                            // 如果电脑端也没有找到[圖]标签
                            console.warn('草榴Manager: 电脑端搜索页也未找到[圖]标签');
                            loadingDiv.textContent = '无图';
                        } catch (err) {
                            console.warn('草榴Manager: 获取电脑端搜索页失败:', err);
                            // 确保切换回手机端
                            try {
                                await fetch('https://t66y.com/mobile.php?ismobile=yes', {
                                    credentials: 'include'
                                });
                            } catch (e) {
                                console.error('草榴Manager: 切换回手机端失败:', e);
                            }
                            loadingDiv.textContent = '无图';
                        }
                    } catch (err) {
                        console.warn('草榴Manager: 加载封面失败:', threadUrl, err);
                        loadingDiv.textContent = '失败';
                    }
                })();
            });
            
            // 替换表格
            table.parentNode.insertBefore(grid, table);
        }
        
        // 初始转换
        convertSearchToCards();
        
        // 监听DOM变化
        const searchObserver = new MutationObserver(() => {
            convertSearchToCards();
        });
        searchObserver.observe(document.body, { childList: true, subtree: true });
    }

    // 电脑端板块图文模式页面（thread0806.php 图文模式）
    // 只在电脑端应用，手机端有单独的样式
    if (!isMobilePage() && href.indexOf('thread0806.php') !== -1) {
        // 圖文模式封面在 .wf_item .image-big img 中
        // 鼠標懸停封面圖時，放大約 2 倍（約 100% 放大），並保證不被父元素裁切
        injectStyle(`
            /* 封面容器 - 允许内容溢出，创建独立层叠上下文 */
            .wf_item .image-big {
                position: relative;
                overflow: visible !important;
                isolation: isolate;
                transition: transform 0.2s ease-in-out;
                transform-origin: center center;
            }
            
            /* 悬停时整个容器放大 - 这样图片和按钮都会一起放大 */
            .wf_item .image-big:hover {
                transform: scale(2);
                z-index: 9999;
            }
            
            /* 图片样式 */
            .wf_item .image-big img {
                display: block;
                border-radius: 4px;
                transition: box-shadow 0.2s ease-in-out, border 0.2s ease-in-out;
            }
            
            /* 悬停时图片添加阴影和边框 */
            .wf_item .image-big:hover img {
                box-shadow: 0 0 12px rgba(0, 0, 0, 0.7);
                border: 2px solid #ffffff;
            }
            
            /* 画廊按钮 - 位于容器内部 */
            .wf_item .clm-cover-gallery-btn {
                position: absolute;
                left: 50%;
                bottom: 30%;
                transform: translateX(-50%);
                padding: 8px 16px;
                font-size: 13px;
                font-weight: 600;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.6);
                background: rgba(0, 0, 0, 0.50);
                color: #fff;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                z-index: 10;
                white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                transition: background 0.15s ease-in-out;
                pointer-events: auto;
            }
            
            .wf_item .clm-cover-gallery-btn:hover {
                background: rgba(0, 0, 0, 0.95);
            }
            
            /* 下载按钮 - 位于容器内部 */
            .wf_item .clm-cover-download {
                position: absolute;
                top: 8px;
                right: 8px;
                padding: 4px 8px;
                font-size: 11px;
                border-radius: 4px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgba(0, 0, 0, 0.7);
                color: #fff;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                z-index: 10;
                transition: background 0.15s ease-in-out;
                pointer-events: auto;
            }
            
            .wf_item .clm-cover-download.clm-downloaded {
                background: rgba(16, 185, 129, 0.9);
                border-color: rgba(255, 255, 255, 0.55);
            }
            
            .wf_item .clm-cover-download::before {
                content: '⬇';
                font-size: inherit;
            }
            
            .wf_item .clm-cover-download:hover {
                background: rgba(0, 0, 0, 0.9);
            }
            
            /* 清晰度标签 - 位于容器内部 */
            .wf_item .clm-cover-quality {
                position: absolute;
                left: 8px;
                top: 8px;
                z-index: 10;
                max-width: 55px;
                font-size: 9px;
                padding: 2px 5px;
                pointer-events: none;
            }
            .wf_item .clm-text-quality {
                position: relative;
                left: auto;
                bottom: auto;
                display: inline-flex;
                margin-top: 6px;
                transform: none;
            }
            .wf_item.clm-thread-downloaded {
                position: relative;
                box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
                border-radius: 6px;
            }
            .wf_item.clm-thread-downloaded::after {
                content: '已下載';
                position: absolute;
                top: 8px;
                left: 8px;
                background: rgba(34, 197, 94, 0.85);
                color: #fff;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 999px;
                letter-spacing: 0.08em;
                z-index: 2;
            }
        `);

        const COVER_SCALE = 2;

        function attachCoverDownloadButtons() {
            const covers = document.querySelectorAll('.wf_item .image-big');
            covers.forEach(cover => {
                if (cover.dataset.clmCoverBtnAttached === '1') return;
                cover.dataset.clmCoverBtnAttached = '1';
                const wfItem = cover.closest('.wf_item');

                // 创建画廊按钮
                const galleryBtn = document.createElement('button');
                galleryBtn.type = 'button';
                galleryBtn.className = 'clm-cover-gallery-btn';
                galleryBtn.textContent = '画廊';
                cover.appendChild(galleryBtn);

                // 创建下载按钮
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'clm-cover-download';
                cover.appendChild(btn);

                // 创建品质徽章
                const qualityBadge = document.createElement('div');
                qualityBadge.className = 'clm-quality-badge clm-cover-quality';
                qualityBadge.style.display = 'none';
                cover.appendChild(qualityBadge);

                const img = cover.querySelector('img');

                // 鼠标悬停时设置CSS变量，让按钮和品质标识随封面放大
                cover.addEventListener('mouseenter', () => {
                    cover.style.setProperty('--clm-cover-scale', COVER_SCALE);
                });
                cover.addEventListener('mouseleave', () => {
                    cover.style.setProperty('--clm-cover-scale', '1');
                });

                let threadUrl = null;
                const threadAnchor = cover.querySelector('a[href]') ||
                    wfItem?.querySelector('a[href]');
                if (threadAnchor) {
                    const rawHref = threadAnchor.getAttribute('href') || threadAnchor.href;
                    threadUrl = getAbsoluteUrl(rawHref);
                    if (threadUrl) {
                        bindGalleryVisitedIndicator(cover, threadUrl, 'cover');
                    }
                    if (threadUrl) {
                        cover.addEventListener('mouseenter', () => {
                            const hoverQuality = ensureCoverQuality();
                            setCurrentListHover({
                                source: 'board',
                                threadUrl,
                                cover,
                                qualityTag: hoverQuality
                            });
                        });
                        cover.addEventListener('mouseleave', () => {
                            if (currentListHoverCtx?.cover === cover) {
                                setCurrentListHover(null);
                            }
                        });
                    }
                }

                const resolveCoverQuality = () => {
                    return resolveQualityTagFromListItem(wfItem, threadAnchor);
                };
                let cachedCoverQuality = null;
                const ensureCoverQuality = () => {
                    cachedCoverQuality = resolveCoverQuality();
                    updateQualityBadgeElement(qualityBadge, cachedCoverQuality);
                    return cachedCoverQuality;
                };
                ensureCoverQuality();

                // 画廊按钮点击事件
                if (threadUrl) {
                    galleryBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const qualityTag = ensureCoverQuality();
                        openGalleryForThread(threadUrl, { instant: true, qualityTag });
                    });
                }

                setupThreadDownloadButton(btn, {
                    threadUrl,
                    container: wfItem,
                    containerClass: 'clm-thread-downloaded',
                    label: '下載',
                    downloadedLabel: '已下載',
                    threadTitle: (threadAnchor?.textContent || '').trim()
                });
            });
        }

        function attachTextOnlyQualityBadges() {
            const items = document.querySelectorAll('.wf_item');
            items.forEach(item => {
                if (item.querySelector('.image-big')) {
                    return;
                }
                const threadAnchor = item.querySelector('a[href]');
                const qualityTag = resolveQualityTagFromListItem(item, threadAnchor);
                let badge = item.querySelector('.clm-text-quality');
                if (!qualityTag) {
                    if (badge) {
                        badge.remove();
                    }
                    return;
                }
                const textContainer = item.querySelector('.wf_text');
                if (!textContainer) {
                    return;
                }
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'clm-quality-badge clm-text-quality';
                    textContainer.appendChild(badge);
                }
                updateQualityBadgeElement(badge, qualityTag);
            });
        }

        attachCoverDownloadButtons();
        attachTextOnlyQualityBadges();

        const coverObserver = new MutationObserver(() => {
            attachCoverDownloadButtons();
            attachTextOnlyQualityBadges();
        });
        coverObserver.observe(document.body, { childList: true, subtree: true });
    }

    /**
     * -------------------------------
     *   手机端支持
     * -------------------------------
     */
    const pageType = detectPageType();
    const isMobile = isMobilePage();

    // 手机端板块页面（thread0806.php 图文模式）
    if (isMobile && href.indexOf('thread0806.php') !== -1) {
        // 手机端图文模式，添加触控优化的画廊按钮，禁用放大
        injectStyle(`
            .wf_item .image-big {
                overflow: hidden !important;
                position: relative;
            }
            .wf_item .image-big img {
                transition: none !important;
                transform: none !important;
            }
            .wf_item .image-big:hover img {
                transform: none !important;
            }
            .wf_item .clm-cover-gallery-btn {
                position: absolute;
                left: 50%;
                bottom: 35%;
                transform: translateX(-50%);
                padding: 10px 20px;
                font-size: 15px;
                font-weight: 600;
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.6);
                background: rgba(0, 0, 0, 0.85);
                color: #fff;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                z-index: 10000;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
            }
            .wf_item .clm-cover-gallery-btn:active {
                background: rgba(0, 0, 0, 0.95);
                transform: translateX(-50%) scale(0.95);
            }
            .wf_item .clm-cover-download {
                position: absolute;
                top: 8px;
                right: 8px;
                padding: 6px 12px;
                font-size: 13px;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.4);
                background: rgba(0, 0, 0, 0.75);
                color: #fff;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                z-index: 2;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
            }
            .wf_item .clm-cover-download:active {
                background: rgba(0, 0, 0, 0.9);
                transform: scale(0.95);
            }
            .wf_item .clm-cover-download.clm-downloaded {
                background: rgba(16, 185, 129, 0.9);
                border-color: rgba(255, 255, 255, 0.55);
            }
            .wf_item .clm-cover-download::before {
                content: '⬇';
                font-size: 13px;
            }
            .wf_item .clm-cover-quality {
                position: absolute;
                left: 8px;
                top: 8px;
                z-index: 10000;
                max-width: 50px;
                font-size: 9px;
                padding: 2px 5px;
            }
            .wf_item .clm-text-quality {
                position: relative;
                left: auto;
                bottom: auto;
                display: inline-flex;
                margin-top: 6px;
                transform: none;
            }
            .wf_item.clm-thread-downloaded {
                position: relative;
                box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
                border-radius: 6px;
            }
            .wf_item.clm-thread-downloaded::after {
                content: '已下載';
                position: absolute;
                top: 8px;
                left: 8px;
                background: rgba(34, 197, 94, 0.85);
                color: #fff;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 999px;
                letter-spacing: 0.08em;
                z-index: 2;
            }
        `);

        function attachMobileCoverButtons() {
            const covers = document.querySelectorAll('.wf_item .image-big');
            covers.forEach(cover => {
                if (cover.dataset.clmMobileBtnAttached === '1') return;
                cover.dataset.clmMobileBtnAttached = '1';
                const wfItem = cover.closest('.wf_item');

                // 添加画廊按钮
                const galleryBtn = document.createElement('button');
                galleryBtn.type = 'button';
                galleryBtn.className = 'clm-cover-gallery-btn';
                galleryBtn.textContent = '画廊';
                cover.appendChild(galleryBtn);

                // 添加下载按钮
                const downloadBtn = document.createElement('button');
                downloadBtn.type = 'button';
                downloadBtn.className = 'clm-cover-download';
                downloadBtn.textContent = '下載';
                cover.appendChild(downloadBtn);

                // 添加品质徽章
                const qualityBadge = document.createElement('div');
                qualityBadge.className = 'clm-quality-badge clm-cover-quality';
                cover.appendChild(qualityBadge);

                const threadAnchor = wfItem.querySelector('a[href]');
                const threadUrl = threadAnchor ? getAbsoluteUrl(threadAnchor.getAttribute('href') || threadAnchor.href) : null;
                const qualityTag = resolveQualityTagFromListItem(wfItem, threadAnchor);
                updateQualityBadgeElement(qualityBadge, qualityTag);

                if (threadUrl) {
                    cover.dataset.clmThreadKey = threadUrl;
                    bindGalleryVisitedIndicator(cover, threadUrl, 'cover');

                    // 画廊按钮点击事件
                    galleryBtn.addEventListener('click', (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        openGalleryForThread(threadUrl, { instant: true, qualityTag });
                    });

                    // 设置下载按钮
                    const threadTitle = (threadAnchor?.textContent || '').trim();
                    setupThreadDownloadButton(downloadBtn, {
                        threadUrl,
                        container: wfItem,
                        containerClass: 'clm-thread-downloaded',
                        label: '下載',
                        downloadedLabel: '已下載',
                        threadTitle
                    });
                }
            });
        }

        function attachMobileTextOnlyQualityBadges() {
            const items = document.querySelectorAll('.wf_item');
            items.forEach(item => {
                if (item.querySelector('.image-big')) {
                    return;
                }
                const threadAnchor = item.querySelector('a[href]');
                const qualityTag = resolveQualityTagFromListItem(item, threadAnchor);
                let badge = item.querySelector('.clm-text-quality');
                if (!qualityTag) {
                    if (badge) {
                        badge.remove();
                    }
                    return;
                }
                const textContainer = item.querySelector('.wf_text');
                if (!textContainer) {
                    return;
                }
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'clm-quality-badge clm-text-quality';
                    textContainer.appendChild(badge);
                }
                updateQualityBadgeElement(badge, qualityTag);
            });
        }

        attachMobileCoverButtons();
        attachMobileTextOnlyQualityBadges();

        const mobileObserver = new MutationObserver(() => {
            attachMobileCoverButtons();
            attachMobileTextOnlyQualityBadges();
        });
        mobileObserver.observe(document.body, { childList: true, subtree: true });
    }

    // 手机端页面 - 画廊模式适配
    // 只要是手机端，就注入抖音风格样式（不限于 htm_mob 页面）
    if (isMobile) {
        // 手机端画廊模式适配 - 抖音短视频风格
        injectStyle(`
            /* 手机端画廊模式 - 抖音风格布局 - 覆盖所有桌面端样式 */
            body.clm-mobile-gallery .clm-gallery-overlay {
                padding: 0 !important;
                background: #000 !important;
                transform: none !important;
                align-items: stretch !important;
                justify-content: stretch !important;
            }
            body.clm-mobile-gallery .clm-gallery-layout {
                display: flex !important;
                flex-direction: column !important;
                gap: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                max-width: 100vw !important;
                max-height: 100vh !important;
                position: relative !important;
                grid-template-columns: none !important;
            }
            
            /* 隐藏所有桌面端元素（手机端下保留 actions 作为下载按钮区域） */
            body.clm-mobile-gallery .clm-gallery-panel-topic,
            body.clm-mobile-gallery .clm-gallery-panel-comments {
                display: none !important;
            }
            body.clm-mobile-gallery .clm-gallery-arrow,
            body.clm-mobile-gallery .clm-gallery-meta,
            body.clm-mobile-gallery .clm-gallery-hint,
            /* 隐藏底部的viewer广告区域 */
            .clm-gallery-ads-slot-viewer-bottom {
                display: none !important;
            }
            
            /* 顶部广告区域 - ftad-ct（手机端：带浅色背景条，类似 footer 效果） */
            body.clm-mobile-gallery .clm-gallery-ads-slot-viewer-top {
                position: fixed !important;
                top: 50px !important;
                left: 0 !important;
                right: 0 !important;
                width: 100% !important;
                max-width: 100vw !important;
                background: #f9f9ec !important;
                z-index: 100001 !important;
                padding: 6px 8px !important;
                max-height: 110px !important;
                overflow-y: hidden !important;
                box-sizing: border-box !important;
            }
            
            /* 修复手机端帖子内广告样式 */
            body.clm-mobile-gallery .clm-panel-entry-tips {
                width: 100% !important;
                margin-top: 10px !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips .sptable_do_not_remove {
                width: 100% !important;
                background: rgba(255, 255, 255, 0.05) !important;
                border-radius: 8px !important;
                overflow: hidden !important;
                margin-bottom: 8px !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips .f_one {
                padding: 10px !important;
                background: rgba(255, 255, 255, 0.08) !important;
                border-radius: 8px !important;
                margin-bottom: 8px !important;
                cursor: pointer !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips .f_one:active {
                background: rgba(255, 255, 255, 0.12) !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-ads table.sptable_do_not_remove {
                width: 100% !important;
                background: rgba(255, 255, 255, 0.05) !important;
                border-radius: 8px !important;
                overflow: hidden !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips table.sptable_do_not_remove td,
            body.clm-mobile-gallery .clm-gallery-ads table.sptable_do_not_remove td {
                padding: 10px !important;
                font-size: 13px !important;
                line-height: 1.4 !important;
                color: #fff !important;
                background: transparent !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips #ti,
            body.clm-mobile-gallery .clm-gallery-ads table.sptable_do_not_remove #ti {
                font-weight: 600 !important;
                margin-bottom: 4px !important;
                font-size: 14px !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips #ti a,
            body.clm-mobile-gallery .clm-gallery-ads table.sptable_do_not_remove #ti a {
                color: #fff !important;
                text-decoration: none !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips a,
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry-tips a,
            body.clm-mobile-gallery .clm-gallery-ads table.sptable_do_not_remove a {
                color: #9db4ff !important;
                text-decoration: none !important;
            }
            
            /* 不再在手机端展示 sptable_info AD 小标签（DOM 层已不创建） */
            
            /* 关闭按钮移到顶部右上角 */
            body.clm-mobile-gallery .clm-gallery-close {
                position: fixed !important;
                top: 8px !important;
                right: 8px !important;
                z-index: 100004 !important;
                width: 40px !important;
                height: 40px !important;
                background: rgba(0, 0, 0, 0.7) !important;
                border-radius: 50% !important;
                font-size: 22px !important;
                border: none !important;
                color: #fff !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                touch-action: manipulation !important;
                -webkit-tap-highlight-color: transparent !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-close:active {
                transform: scale(0.9) !important;
                background: rgba(0, 0, 0, 0.9) !important;
            }
            
            /* 中央图片查看器 - 屏幕正中央 */
            body.clm-mobile-gallery .clm-gallery-viewer-column {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 1 !important;
                gap: 0 !important;
                min-height: 100vh !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-viewer {
                width: 100% !important;
                height: 100% !important;
                max-width: 100vw !important;
                max-height: 100vh !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                position: relative !important;
                flex: 1 !important;
                background: transparent !important;
                border-radius: 0 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-viewer img {
                max-width: 100vw !important;
                max-height: 100vh !important;
                width: auto !important;
                height: auto !important;
                object-fit: contain !important;
                touch-action: pan-x pan-y pinch-zoom !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                cursor: default !important;
            }
            
            /* 隐藏加载指示器和其他viewer内元素，只保留图片 */
            body.clm-mobile-gallery .clm-gallery-loading-indicator {
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                z-index: 100002 !important;
                color: #fff !important;
                font-size: 16px !important;
            }
            
            /* 主题内容底部抽屉（Bottom Sheet） - 黑色毛玻璃渐变背景 */
            body.clm-mobile-gallery .clm-gallery-panel-topic {
                display: block !important;
                position: fixed !important;
                left: 0 !important;
                bottom: 0 !important;
                width: 100% !important;
                max-width: 100vw !important;
                background: linear-gradient(to top, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.6)) !important;
                backdrop-filter: blur(16px) !important;
                -webkit-backdrop-filter: blur(16px) !important;
                border-radius: 0 !important;
                padding: 0 30px 24px !important;
                z-index: 100002 !important;
                overflow: visible !important;
                color: #f9fafb !important;
                box-shadow: 0 -5px 30px rgba(0, 0, 0, 0.5) !important;
                border: none !important;
                flex-direction: column !important;
                cursor: pointer !important;
            }
            
            /* 折叠状态下：高度约占屏幕底部四分之一，便于点击 */
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-collapsed {
                min-height: 25vh !important;
                max-height: 25vh !important;
            }

            /* 顶部中间的箭头图标（与手机端画廊.html 的 arrow-large 风格一致） */
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-collapsed::after,
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-expanded::after {
                content: '' !important;
                position: absolute !important;
                top: 0 !important;
                left: 50% !important;
                width: 24px !important;
                height: 24px !important;
                border-radius: 0 !important;
                border-right: 4px solid #333 !important;
                border-bottom: 4px solid #333 !important;
                transform: translate(-50%, -50%) rotate(225deg) !important;
                background: transparent !important;
                box-shadow: none !important;
                pointer-events: none !important;
                opacity: 0.7 !important;
            }

            /* 展开状态：箭头向上（整体图标旋转） */
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-expanded::after {
                transform: translate(-50%, -50%) rotate(45deg) !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-header {
                display: none !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body {
                font-size: 14px !important;
                line-height: 1.5 !important;
                color: #f9fafb !important;
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9) !important;
                overflow-y: auto !important;
                max-height: 100% !important;
                padding: 24px 0 24px !important;
                background: transparent !important;
                border-radius: 0 !important;
                border: none !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                position: relative !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-collapsed .clm-gallery-panel-body {
                overflow: hidden !important;
                max-height: 25vh !important; /* 抽屉收起时约显示屏幕 1/4 的内容 */
            }
            
            /* 渐变遮罩，提示下方还有更多内容（深色渐变） */
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body::after {
                content: '' !important;
                position: absolute !important;
                bottom: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 80px !important;
                background: linear-gradient(to bottom, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.95) 100%) !important;
                pointer-events: none !important;
                opacity: 1 !important;
                transition: opacity 0.3s !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-expanded .clm-gallery-panel-body::after {
                opacity: 0 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body p {
                margin: 4px 0 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body .clm-panel-entry-title {
                margin-bottom: 8px !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body .clm-panel-entry-title-tags {
                display: flex !important;
                flex-wrap: wrap !important;
                gap: 6px !important;
                margin-bottom: 6px !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body .clm-panel-entry-title-tag {
                padding: 3px 8px !important;
                border-radius: 4px !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8) !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body .clm-panel-entry-title-text {
                font-size: 16px !important;
                font-weight: 700 !important;
                line-height: 1.4 !important;
                color: #f9fafb !important;
                text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9) !important;
            }
            
            /* 重新显示右侧评论按钮 - 抖音风格 */
            body.clm-mobile-gallery .clm-gallery-panel-comments {
                display: flex !important;
                position: fixed !important;
                right: 8px !important;
                bottom: 200px !important;
                width: auto !important;
                max-height: none !important;
                background: transparent !important;
                padding: 0 !important;
                z-index: 100002 !important;
                flex-direction: column !important;
                gap: 20px !important;
                align-items: center !important;
                transform: none !important;
                border: none !important;
            }
            
            .clm-mobile-comment-btn {
                width: 56px !important;
                height: 56px !important;
                border-radius: 50% !important;
                background: rgba(40, 40, 40, 0.75) !important;
                border: 2px solid rgba(255, 255, 255, 0.2) !important;
                color: #fff !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                touch-action: manipulation !important;
                -webkit-tap-highlight-color: transparent !important;
                box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4) !important;
            }
            
            .clm-mobile-comment-btn:active {
                transform: scale(0.92) !important;
                background: rgba(60, 60, 60, 0.85) !important;
            }
            
            /* 隐藏原有的评论面板头部和内容，只显示按钮 */
            .clm-gallery-panel-comments .clm-gallery-panel-header,
            .clm-gallery-panel-comments .clm-gallery-panel-body {
                display: none !important;
            }
            
            /* 点击评论按钮后展开的评论面板 */
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded {
                position: fixed !important;
                left: 0 !important;
                bottom: 0 !important;
                right: 0 !important;
                top: 30% !important;
                width: 100% !important;
                max-width: 100vw !important;
                max-height: 70vh !important;
                background: rgba(20, 20, 20, 0.98) !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                border-radius: 20px 20px 0 0 !important;
                padding: 20px !important;
                z-index: 100003 !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                transform: none !important;
                display: block !important;
                box-sizing: border-box !important;
                margin: 0 !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-header {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                margin-bottom: 16px !important;
                padding-bottom: 12px !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
                font-size: 18px !important;
                font-weight: 600 !important;
                color: #fff !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body {
                display: block !important;
                max-height: 70vh !important;
                overflow-y: auto !important;
                padding: 16px !important;
                background: rgba(245, 245, 245, 0.95) !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded {
                background: rgba(255, 255, 255, 0.98) !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-header {
                color: #333 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry {
                background: transparent !important;
                border-radius: 0 !important;
                padding: 12px 0 !important;
                margin-bottom: 0 !important;
                border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry:last-child {
                border-bottom: none !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry-user {
                color: #666 !important;
                font-size: 12px !important;
                margin-bottom: 6px !important;
                font-weight: 500 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry-content {
                color: #333 !important;
                font-size: 14px !important;
                line-height: 1.6 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry {
                margin-bottom: 20px !important;
                padding-bottom: 16px !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry:last-child {
                border-bottom: none !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry-user {
                color: rgba(255, 255, 255, 0.7) !important;
                font-size: 13px !important;
                margin-bottom: 8px !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry-text {
                color: #fff !important;
                font-size: 15px !important;
                line-height: 1.6 !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-ads {
                margin: 12px 0 !important;
                padding: 12px !important;
                background: rgba(255, 255, 255, 0.05) !important;
                border-radius: 8px !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-mobile-comment-btn {
                position: absolute !important;
                top: 16px !important;
                right: 16px !important;
                width: 36px !important;
                height: 36px !important;
                font-size: 20px !important;
            }
            
            /* 隐藏翻页箭头按钮（使用滑动手势） */
            .clm-gallery-arrow-left,
            .clm-gallery-arrow-right {
                display: none !important;
            }
            
            /* 隐藏底部的viewer广告区域 */
            .clm-gallery-ads-slot-viewer-bottom {
                display: none !important;
            }
            
            /* 隐藏 meta、hint 等桌面端提示元素（下载按钮 actions 在手机端保留） */
            .clm-gallery-meta,
            .clm-gallery-hint {
                display: none !important;
            }

            /* 手机端：将下载按钮区域与评论按钮一起放在右侧中部，采用胶囊样式 */
            body.clm-mobile-gallery .clm-gallery-actions {
                position: fixed !important;
                right: 20px !important;
                top: 60% !important;
                bottom: auto !important;
                width: auto !important;
                max-width: none !important;
                padding: 0 !important;
                box-sizing: border-box !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                z-index: 100001 !important; /* 低于主题抽屉(100002)，让抽屉展开时可以遮挡 */
                pointer-events: none !important;
            }

            body.clm-mobile-gallery .clm-gallery-actions .clm-gallery-download-btn {
                pointer-events: auto !important;
                min-width: 120px !important;
                height: 44px !important;
                padding: 0 18px !important;
                border-radius: 22px !important;
                background: rgba(255, 255, 255, 0.9) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important;
                border: none !important;
                color: #333 !important;
                font-weight: 600 !important;
                font-size: 14px !important;
            }
            
            /* 品质徽章 */
            .clm-gallery-quality {
                position: fixed !important;
                top: 60px !important;
                left: 12px !important;
                z-index: 100002 !important;
                font-size: 11px !important;
                padding: 4px 8px !important;
                border-radius: 6px !important;
                background: rgba(0, 0, 0, 0.7) !important;
                color: #fff !important;
                backdrop-filter: blur(8px) !important;
                -webkit-backdrop-filter: blur(8px) !important;
            }
            
            /* 下载预览面板 */
            .clm-gallery-download-preview {
                position: fixed !important;
                left: 50% !important;
                top: 50% !important;
                transform: translate(-50%, -50%) !important;
                width: 90vw !important;
                max-width: 500px !important;
                max-height: 80vh !important;
                padding: 20px !important;
                background: rgba(0, 0, 0, 0.95) !important;
                backdrop-filter: blur(15px) !important;
                -webkit-backdrop-filter: blur(15px) !important;
                border-radius: 16px !important;
                z-index: 100004 !important;
                overflow-y: auto !important;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6) !important;
            }
            
            .clm-gallery-download-preview h3 {
                font-size: 18px !important;
                margin-bottom: 16px !important;
                color: #fff !important;
            }
            
            .clm-gallery-download-preview .clm-download-item {
                padding: 12px !important;
                margin-bottom: 12px !important;
                font-size: 14px !important;
            }
            
            .clm-gallery-download-preview button {
                padding: 12px 18px !important;
                font-size: 15px !important;
                min-height: 48px !important;
                border-radius: 12px !important;
                touch-action: manipulation !important;
                -webkit-tap-highlight-color: transparent !important;
            }
            
            .clm-gallery-download-preview button:active {
                transform: scale(0.97) !important;
            }
            
            /* 点击指示器动画 */
            @keyframes tapFade {
                0% {
                    opacity: 0;
                    transform: translateY(-50%) scale(0.5);
                }
                50% {
                    opacity: 1;
                    transform: translateY(-50%) scale(1);
                }
                100% {
                    opacity: 0;
                    transform: translateY(-50%) scale(1.2);
                }
            }
        `);
        injectStyle(`
            /* 主题内容抽屉内边距：顶部保留空隙，底部尽量贴近屏幕 */
            body.clm-mobile-gallery .clm-gallery-panel-topic {
                padding: 0 0 0 !important; /* 减小左右留白，让内容更居中 */
            }

            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body {
                padding: 24px 16px 12px !important; /* 顶部 24px，左右 16px，底部 12px，更接近屏幕底部且留出左右空隙 */
                overflow-x: hidden !important; /* 禁止出现左右滚动条 */
            }

            /* 主题内容：去掉内部卡片感，占满抽屉宽度，避免左侧/底部空白 */
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry {
                background: transparent !important;
                border-radius: 0 !important;
                padding: 0 0 8px !important;
                margin: 0 !important;
                width: 100% !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry-title {
                margin-bottom: 6px !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry-title-tags {
                margin-bottom: 4px !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry-title-tag {
                text-shadow: none !important;
            }

            /* 标题文字使用浅色并带阴影，适配深色毛玻璃背景 */
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry-title-text {
                color: #f9fafb !important;
                text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9) !important;
            }

            /* 去掉 tips 的上边框，避免在抽屉顶部看到一条“分割线” */
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry-tips {
                border-top: none !important;
                padding-top: 0 !important;
                margin-top: 8px !important;
                color: #e5e7eb !important;
            }

            /* 折叠状态下不再强制 25vh 高度，只让内容自己决定高度 */
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-collapsed {
                min-height: 25vh !important;
                max-height: 25vh !important;
            }

            /* 画廊 viewer 区域禁止文本选中和图片拖动，避免拖动时出现选中效果 */
            body.clm-mobile-gallery .clm-gallery-viewer,
            body.clm-mobile-gallery .clm-gallery-viewer * {
                -webkit-user-select: none !important;
                user-select: none !important;
            }

            body.clm-mobile-gallery .clm-gallery-viewer img {
                -webkit-user-drag: none !important;
                user-drag: none !important;
            }

            /* 评论抽屉：白底深色文字，提升可读性 */
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded {
                background: rgba(255, 255, 255, 0.98) !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body {
                background: rgba(245, 245, 245, 0.95) !important;
                border-radius: 12px !important;
                overflow: hidden !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-header {
                color: #333 !important;
            }

            /* 手机端评论弹窗右上角关闭按钮样式 */
            body.clm-mobile-gallery .clm-mobile-comment-close {
                font-size: 22px !important;
                margin-left: auto !important;
                cursor: pointer !important;
                padding: 0 6px !important;
                color: #666 !important;
            }

            body.clm-mobile-gallery .clm-mobile-comment-close:active {
                transform: scale(0.9) !important;
            }

            /* 手机端：评论按钮与下载按钮统一尺寸和样式 */
            body.clm-mobile-gallery .clm-gallery-actions .clm-gallery-download-btn,
            body.clm-mobile-gallery .clm-mobile-comment-btn {
                min-width: 120px !important;
                height: 44px !important;
                padding: 0 16px !important;
                border-radius: 22px !important;
                font-size: 14px !important;
                font-weight: 600 !important;
            }

            /* 手机端：为下载按钮添加图标 */
            body.clm-mobile-gallery .clm-gallery-actions .clm-gallery-download-btn::before {
                content: "↓" !important; /* 向下箭头图标 */
                display: inline-block !important;
                margin-right: 6px !important;
                font-size: 16px !important;
                line-height: 1 !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry-user {
                color: #666 !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry-content {
                color: #333 !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry-user {
                color: #666 !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry-content,
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry-text {
                color: #333 !important;
            }

            /* 手机端评论触发按钮：完全复刻手机端画廊.html 的 comment-trigger，位置在右侧中部偏上 */
            body.clm-mobile-gallery .clm-mobile-comment-btn {
                position: fixed !important;
                right: 20px !important;
                top: 45% !important;
                bottom: auto !important;
                width: auto !important;
                min-width: 120px !important;
                height: 44px !important;
                padding: 0 16px !important;
                border-radius: 22px !important;
                background: rgba(255, 255, 255, 0.9) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                gap: 8px !important;
                cursor: pointer !important;
                z-index: 2100 !important;
                border: none !important;
                transition: transform 0.2s, background-color 0.2s, top 0.3s !important;
                user-select: none !important;
                color: #333 !important;
                pointer-events: auto !important;
            }

            body.clm-mobile-gallery .clm-mobile-comment-btn:active {
                transform: scale(0.95) !important;
                background-color: #ffffff !important;
            }

            body.clm-mobile-gallery .clm-mobile-comment-btn .comment-icon {
                width: 18px !important;
                height: 18px !important;
            }

            body.clm-mobile-gallery .clm-mobile-comment-btn .comment-label {
                font-size: 14px !important;
                font-weight: 600 !important;
            }

            body.clm-mobile-gallery .clm-gallery-close {
                top: 12px !important;
                right: 12px !important;
            }
        `);
    }

    /**
     * -------------------------------
     *   全局：右下角設置面板 & qBittorrent
     * -------------------------------
     */

    const STORAGE_KEY = '草榴ManagerSettings';

    const DEFAULT_SETTINGS = {
        qb: {
            enabled: false,
            baseUrl: '',
            username: '',
            password: '',
            defaultCategory: '',
            savePresets: [
                {
                    id: 'default',
                    name: '預設下載目錄',
                    savePath: '',
                    tags: ''
                }
            ]
        }
    };

    function loadSettings() {
        let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    if (parsed.qb) {
                        Object.assign(settings.qb, parsed.qb);
                        if (Array.isArray(parsed.qb.savePresets)) {
                            settings.qb.savePresets = parsed.qb.savePresets.map((preset) => Object.assign({}, preset));
                        }
                    }
                }
            }
        } catch (e) {
            console.error('草榴Manager: 設置讀取失敗，使用默認值', e);
            settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
        normalizeSavePresets(settings);
        return settings;
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('草榴Manager: 設置保存失敗', e);
        }
    }

    function normalizeSavePresets(settings) {
        const list = Array.isArray(settings.qb.savePresets) ? settings.qb.savePresets : [];
        if (!list.length) {
            settings.qb.savePresets = DEFAULT_SETTINGS.qb.savePresets.map((preset) => Object.assign({}, preset));
            return;
        }
        let mutated = false;
        settings.qb.savePresets = list.map((preset, index) => {
            const cloned = Object.assign({}, preset);
            if (!cloned.id) {
                cloned.id = index === 0 ? 'default' : `preset_${Date.now()}_${index}`;
                mutated = true;
            }
            return cloned;
        });
        if (mutated) {
            saveSettings(settings);
        }
    }

    /**
     * 检查是否需要自动更新模块
     */
    function shouldAutoCheckUpdate() {
        try {
            const enabled = localStorage.getItem(AUTO_UPDATE_CHECK_KEY);
            if (enabled !== 'true') return false;
            
            const lastCheck = parseInt(localStorage.getItem(LAST_UPDATE_CHECK_KEY) || '0', 10);
            const now = Date.now();
            return (now - lastCheck) >= AUTO_UPDATE_INTERVAL;
        } catch (e) {
            return false;
        }
    }

    /**
     * 记录最后检查更新时间
     */
    function updateLastCheckTime() {
        try {
            localStorage.setItem(LAST_UPDATE_CHECK_KEY, String(Date.now()));
        } catch (e) {
            console.warn('草榴Manager: 无法记录更新检查时间', e);
        }
    }

    /**
     * 获取自动更新设置
     */
    function getAutoUpdateEnabled() {
        try {
            return localStorage.getItem(AUTO_UPDATE_CHECK_KEY) === 'true';
        } catch (e) {
            return false;
        }
    }

    /**
     * 设置自动更新
     */
    function setAutoUpdateEnabled(enabled) {
        try {
            localStorage.setItem(AUTO_UPDATE_CHECK_KEY, enabled ? 'true' : 'false');
        } catch (e) {
            console.warn('草榴Manager: 无法保存自动更新设置', e);
        }
    }

    /**
     * 向頁面注入右下角的設置按鈕與面板
     */
    function createSettingsUI() {
        injectStyle(`
            .clm-settings-btn {
                position: fixed;
                right: 16px;
                bottom: 16px;
                z-index: 10001;
                background: rgba(0, 0, 0, 0.7);
                color: #fff;
                border-radius: 20px;
                padding: 10px 18px;
                cursor: pointer;
                font-size: 16px;
                line-height: 1.4;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
                user-select: none;
            }
            .clm-settings-btn:hover {
                background: rgba(0, 0, 0, 0.85);
            }
            .clm-settings-panel-mask {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.4);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .clm-settings-panel {
                width: 420px;
                max-width: 95vw;
                max-height: 85vh;
                background: #f5f5f5;
                color: #333;
                border-radius: 8px;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
                font-size: 12px;
                display: flex;
                flex-direction: column;
            }
            .clm-settings-header {
                padding: 10px 12px;
                border-bottom: 1px solid #ddd;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #fafafa;
            }
            .clm-settings-close {
                cursor: pointer;
                padding: 0 6px;
            }
            .clm-settings-body {
                padding: 10px 12px;
                overflow: auto;
            }
            .clm-settings-footer {
                padding: 8px 12px;
                border-top: 1px solid #ddd;
                text-align: right;
                background: #fafafa;
            }
            .clm-form-row {
                margin-bottom: 8px;
            }
            .clm-form-row label {
                display: block;
                margin-bottom: 2px;
                font-weight: bold;
            }
            .clm-form-row input[type="text"],
            .clm-form-row input[type="password"] {
                width: 100%;
                box-sizing: border-box;
                padding: 4px 6px;
                border: 1px solid #ccc;
                border-radius: 3px;
                font-size: 12px;
            }
            .clm-form-row input[type="checkbox"] {
                margin-right: 4px;
            }
            .clm-presets-list {
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 6px;
                background: #fff;
                max-height: 200px;
                overflow: auto;
            }
            .clm-test-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .clm-test-status {
                font-size: 11px;
                color: #555;
            }
            .clm-test-status.clm-ok {
                color: #15803d;
            }
            .clm-test-status.clm-failed {
                color: #b91c1c;
            }
            .clm-preset-item {
                border-bottom: 1px dashed #eee;
                padding-bottom: 6px;
                margin-bottom: 6px;
            }
            .clm-preset-item:last-child {
                border-bottom: none;
                padding-bottom: 0;
                margin-bottom: 0;
            }
            .clm-preset-item-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
                font-weight: bold;
            }
            .clm-small-btn {
                display: inline-block;
                padding: 2px 6px;
                font-size: 11px;
                border-radius: 3px;
                border: 1px solid #aaa;
                background: #f7f7f7;
                cursor: pointer;
                margin-left: 4px;
            }
            .clm-small-btn:hover {
                background: #eee;
            }
            .clm-primary-btn {
                border-color: #2b7cff;
                background: #2b7cff;
                color: #fff;
            }
            .clm-primary-btn:hover {
                background: #1f5ecc;
            }
            .clm-log-toolbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
            }
            .clm-log-box {
                max-height: 160px;
                overflow: auto;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 6px;
                background: #fff;
                font-family: Consolas, monospace;
                font-size: 11px;
                line-height: 1.5;
            }
            .clm-log-entry {
                display: flex;
                gap: 6px;
                border-bottom: 1px dotted #eee;
                padding: 2px 0;
            }
            .clm-log-entry:last-child {
                border-bottom: none;
            }
            .clm-log-time {
                color: #6b7280;
                flex: 0 0 52px;
            }
            .clm-log-message {
                flex: 1;
                color: #111827;
            }
            .clm-log-entry.clm-log-info .clm-log-message {
                color: #1f2937;
            }
            .clm-log-entry.clm-log-success .clm-log-message {
                color: #15803d;
            }
            .clm-log-entry.clm-log-warning .clm-log-message {
                color: #b45309;
            }
            .clm-log-entry.clm-log-error .clm-log-message {
                color: #b91c1c;
            }
            .clm-log-empty {
                color: #9ca3af;
                text-align: center;
                padding: 8px 0;
            }
            .clm-transfer-textarea {
                width: 100%;
                box-sizing: border-box;
                padding: 6px 8px;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-size: 11px;
                font-family: Consolas, monospace;
                resize: vertical;
                min-height: 100px;
                background: #fff;
            }
            .clm-transfer-buttons {
                display: flex;
                gap: 8px;
                margin-top: 6px;
            }
        `);

        const btn = document.createElement('div');
        btn.className = 'clm-settings-btn';
        btn.textContent = '草榴Manager 設置';
        btn.addEventListener('click', () => {
            openSettingsPanel();
        });
        document.body.appendChild(btn);
    }

    function openSettingsPanel() {
        const settings = loadSettings();
        let logUnsubscribe = null;
        let connectivityStatusEl = null;
        function clearConnectivityStatus() {
            if (!connectivityStatusEl) return;
            connectivityStatusEl.textContent = '';
            connectivityStatusEl.classList.remove('clm-ok', 'clm-failed');
        }

        const mask = document.createElement('div');
        mask.className = 'clm-settings-panel-mask';

        const panel = document.createElement('div');
        panel.className = 'clm-settings-panel';

        function closePanel() {
            if (logUnsubscribe) {
                logUnsubscribe();
                logUnsubscribe = null;
            }
            if (mask.parentNode) {
                mask.parentNode.removeChild(mask);
            }
        }

        const header = document.createElement('div');
        header.className = 'clm-settings-header';
        header.innerHTML = '<span>草榴Manager 設置</span>';

        const closeBtn = document.createElement('span');
        closeBtn.className = 'clm-settings-close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => {
            closePanel();
        });
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'clm-settings-body';

        // qBittorrent 開關
        const rowEnable = document.createElement('div');
        rowEnable.className = 'clm-form-row';
        const enableLabel = document.createElement('label');
        const enableCheckbox = document.createElement('input');
        enableCheckbox.type = 'checkbox';
        enableCheckbox.checked = !!settings.qb.enabled;
        enableCheckbox.addEventListener('change', () => clearConnectivityStatus());
        enableLabel.appendChild(enableCheckbox);
        enableLabel.appendChild(document.createTextNode('啟用 qBittorrent 集成'));
        rowEnable.appendChild(enableLabel);
        body.appendChild(rowEnable);

        // 基本連接信息
        body.appendChild(createInputRow('qBittorrent WebUI 地址（如：http://127.0.0.1:8080）', settings.qb.baseUrl, (val) => {
            settings.qb.baseUrl = val.trim();
            clearConnectivityStatus();
        }));
        body.appendChild(createInputRow('qBittorrent 用戶名', settings.qb.username, (val) => {
            settings.qb.username = val.trim();
            clearConnectivityStatus();
        }));

        const rowPwd = document.createElement('div');
        rowPwd.className = 'clm-form-row';
        const pwdLabel = document.createElement('label');
        pwdLabel.textContent = 'qBittorrent 密碼';
        const pwdInput = document.createElement('input');
        pwdInput.type = 'password';
        pwdInput.value = settings.qb.password || '';
        pwdInput.addEventListener('input', () => {
            settings.qb.password = pwdInput.value;
            clearConnectivityStatus();
        });
        rowPwd.appendChild(pwdLabel);
        rowPwd.appendChild(pwdInput);
        body.appendChild(rowPwd);

        body.appendChild(createInputRow('統一分類（category）', settings.qb.defaultCategory, (val) => {
            settings.qb.defaultCategory = val.trim();
            clearConnectivityStatus();
        }));

        const testRow = document.createElement('div');
        testRow.className = 'clm-form-row clm-test-row';
        const testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'clm-small-btn';
        testBtn.textContent = '測試連通性';
        const testStatus = document.createElement('span');
        testStatus.className = 'clm-test-status';
        connectivityStatusEl = testStatus;
        testBtn.addEventListener('click', async () => {
            clearConnectivityStatus();
            testBtn.disabled = true;
            testBtn.textContent = '測試中…';
            try {
                const snapshot = JSON.parse(JSON.stringify(settings));
                snapshot.qb.enabled = enableCheckbox.checked;
                const version = await testQbittorrentConnectivity(snapshot);
                testStatus.textContent = '連通成功，版本：' + version;
                testStatus.classList.add('clm-ok');
            } catch (err) {
                testStatus.textContent = '連通失敗：' + (err?.message || err);
                testStatus.classList.add('clm-failed');
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = '測試連通性';
            }
        });
        testRow.appendChild(testBtn);
        testRow.appendChild(testStatus);
        body.appendChild(testRow);

        // 多個儲存位置預設
        const presetsRow = document.createElement('div');
        presetsRow.className = 'clm-form-row';
        const presetsLabel = document.createElement('label');
        presetsLabel.textContent = '儲存位置預設（可為每個路徑設置標籤）';
        presetsRow.appendChild(presetsLabel);

        const presetsWrap = document.createElement('div');
        presetsWrap.className = 'clm-presets-list';

        function renderPresets() {
            presetsWrap.innerHTML = '';
            settings.qb.savePresets.forEach((preset, index) => {
                const item = document.createElement('div');
                item.className = 'clm-preset-item';

                const header = document.createElement('div');
                header.className = 'clm-preset-item-header';
                const title = document.createElement('span');
                title.textContent = preset.name || ('預設路徑 ' + (index + 1));
                const deleteBtn = document.createElement('span');
                deleteBtn.className = 'clm-small-btn';
                deleteBtn.textContent = '刪除';
                deleteBtn.addEventListener('click', () => {
                    if (settings.qb.savePresets.length <= 1) {
                        alert('至少保留一個儲存位置。');
                        return;
                    }
                    settings.qb.savePresets.splice(index, 1);
                    renderPresets();
                });
                header.appendChild(title);
                header.appendChild(deleteBtn);
                item.appendChild(header);

                item.appendChild(createInputRow('名稱', preset.name, (val) => {
                    preset.name = val;
                    title.textContent = val || ('預設路徑 ' + (index + 1));
                }));
                item.appendChild(createInputRow('儲存路徑（savepath）', preset.savePath, (val) => {
                    preset.savePath = val;
                }));
                item.appendChild(createInputRow('標籤（tags，逗號分隔）', preset.tags, (val) => {
                    preset.tags = val;
                }));

                presetsWrap.appendChild(item);
            });
        }

        renderPresets();

        const addPresetBtn = document.createElement('button');
        addPresetBtn.className = 'clm-small-btn';
        addPresetBtn.textContent = '新增儲存位置';
        addPresetBtn.addEventListener('click', () => {
            const id = 'preset_' + Date.now();
            settings.qb.savePresets.push({
                id,
                name: '新建儲存位置',
                savePath: '',
                tags: ''
            });
            renderPresets();
        });

        presetsRow.appendChild(presetsWrap);
        presetsRow.appendChild(addPresetBtn);
        body.appendChild(presetsRow);

        const logRow = document.createElement('div');
        logRow.className = 'clm-form-row';
        const logLabel = document.createElement('label');
        logLabel.textContent = 'qBittorrent 調試日誌';
        logRow.appendChild(logLabel);

        const logToolbar = document.createElement('div');
        logToolbar.className = 'clm-log-toolbar';
        const logHint = document.createElement('span');
        logHint.textContent = '僅保留最近 80 條記錄';
        const clearLogBtn = document.createElement('button');
        clearLogBtn.type = 'button';
        clearLogBtn.className = 'clm-small-btn';
        clearLogBtn.textContent = '清空日誌';
        clearLogBtn.addEventListener('click', () => {
            clearQbLogs();
            showToast('日志已清空', 'success');
        });
        logToolbar.appendChild(logHint);
        logToolbar.appendChild(clearLogBtn);
        logRow.appendChild(logToolbar);

        const logBox = document.createElement('div');
        logBox.className = 'clm-log-box';
        logRow.appendChild(logBox);

        function renderLogs(entries) {
            const logs = (entries || getQbLogs()).slice().reverse();
            logBox.innerHTML = '';
            if (!logs.length) {
                const empty = document.createElement('div');
                empty.className = 'clm-log-empty';
                empty.textContent = '暫無日誌';
                logBox.appendChild(empty);
                return;
            }
            logs.forEach((log) => {
                const item = document.createElement('div');
                item.className = `clm-log-entry clm-log-${log.level || 'info'}`;

                const timeEl = document.createElement('span');
                timeEl.className = 'clm-log-time';
                timeEl.textContent = formatLogTime(log.time);

                const msgEl = document.createElement('span');
                msgEl.className = 'clm-log-message';
                msgEl.textContent = log.message;

                item.appendChild(timeEl);
                item.appendChild(msgEl);
                logBox.appendChild(item);
            });
        }
        renderLogs();
        logUnsubscribe = subscribeQbLogs(renderLogs);

        body.appendChild(logRow);

        // 模块更新管理
        const moduleUpdateRow = document.createElement('div');
        moduleUpdateRow.className = 'clm-form-row';
        const moduleUpdateLabel = document.createElement('label');
        moduleUpdateLabel.textContent = '远程模块管理';
        moduleUpdateRow.appendChild(moduleUpdateLabel);

        // 当前缓存版本信息
        const cache = getRemoteModuleCache();
        const versionInfo = document.createElement('div');
        versionInfo.style.fontSize = '11px';
        versionInfo.style.color = '#666';
        versionInfo.style.marginBottom = '8px';
        versionInfo.textContent = '当前缓存版本：' + (cache.manifestVersion || '未缓存') + 
            (cache.lastUpdated ? ' (更新于 ' + new Date(cache.lastUpdated).toLocaleString() + ')' : '');
        moduleUpdateRow.appendChild(versionInfo);

        // 自动更新选项
        const autoUpdateCheckbox = document.createElement('input');
        autoUpdateCheckbox.type = 'checkbox';
        autoUpdateCheckbox.checked = getAutoUpdateEnabled();
        autoUpdateCheckbox.id = 'clm-auto-update-checkbox';
        const autoUpdateLabel = document.createElement('label');
        autoUpdateLabel.htmlFor = 'clm-auto-update-checkbox';
        autoUpdateLabel.style.display = 'inline-block';
        autoUpdateLabel.style.marginBottom = '8px';
        autoUpdateLabel.appendChild(autoUpdateCheckbox);
        autoUpdateLabel.appendChild(document.createTextNode(' 启用自动更新（每半小时检查一次）'));
        moduleUpdateRow.appendChild(autoUpdateLabel);
        
        autoUpdateCheckbox.addEventListener('change', () => {
            setAutoUpdateEnabled(autoUpdateCheckbox.checked);
            if (autoUpdateCheckbox.checked) {
                updateLastCheckTime(); // 启用时重置检查时间
                showToast('自动更新已启用', 'success');
            } else {
                showToast('自动更新已禁用', 'info');
            }
        });

        // 检测更新按钮和状态
        const updateTestRow = document.createElement('div');
        updateTestRow.className = 'clm-test-row';
        const checkUpdateBtn = document.createElement('button');
        checkUpdateBtn.type = 'button';
        checkUpdateBtn.className = 'clm-small-btn clm-primary-btn';
        checkUpdateBtn.textContent = '检测并更新模块';
        const updateStatus = document.createElement('span');
        updateStatus.className = 'clm-test-status';
        updateStatus.textContent = '';
        
        checkUpdateBtn.addEventListener('click', async () => {
            updateStatus.textContent = '';
            updateStatus.classList.remove('clm-ok', 'clm-failed');
            checkUpdateBtn.disabled = true;
            checkUpdateBtn.textContent = '检测中...';
            
            try {
                // 强制检查更新
                const result = await initRemoteModules(pageType, true);
                updateLastCheckTime();
                
                if (result.updated) {
                    updateStatus.textContent = '模块已更新，3秒后自动刷新页面...';
                    updateStatus.classList.add('clm-ok');
                    showToast('模块更新成功，3秒后自动刷新页面', 'success');
                    
                    // 更新版本信息显示
                    const newCache = getRemoteModuleCache();
                    versionInfo.textContent = '当前缓存版本：' + (newCache.manifestVersion || '未缓存') + 
                        (newCache.lastUpdated ? ' (更新于 ' + new Date(newCache.lastUpdated).toLocaleString() + ')' : '');
                    
                    // 3秒后自动刷新页面
                    setTimeout(() => {
                        location.reload();
                    }, 3000);
                } else if (result.success && !result.updated) {
                    updateStatus.textContent = '已是最新版本';
                    updateStatus.classList.add('clm-ok');
                    showToast('已是最新版本', 'info');
                } else {
                    updateStatus.textContent = '更新失败：' + (result.error || '未知错误');
                    updateStatus.classList.add('clm-failed');
                    showToast('更新失败', 'error');
                }
            } catch (err) {
                updateStatus.textContent = '更新失败：' + (err?.message || err);
                updateStatus.classList.add('clm-failed');
                showToast('更新失败：' + (err?.message || err), 'error');
            } finally {
                checkUpdateBtn.disabled = false;
                checkUpdateBtn.textContent = '检测并更新模块';
            }
        });
        
        updateTestRow.appendChild(checkUpdateBtn);
        updateTestRow.appendChild(updateStatus);
        moduleUpdateRow.appendChild(updateTestRow);
        
        body.appendChild(moduleUpdateRow);

        // 設置轉移功能
        const transferRow = document.createElement('div');
        transferRow.className = 'clm-form-row';
        const transferLabel = document.createElement('label');
        transferLabel.textContent = '設置轉移';
        transferRow.appendChild(transferLabel);

        const transferHint = document.createElement('div');
        transferHint.style.fontSize = '11px';
        transferHint.style.color = '#666';
        transferHint.style.marginBottom = '6px';
        transferHint.textContent = '將下方內容複製到另一台設備的此框內，即可轉移設置';
        transferRow.appendChild(transferHint);

        const transferTextarea = document.createElement('textarea');
        transferTextarea.className = 'clm-transfer-textarea';
        transferTextarea.value = JSON.stringify(settings, null, 2);
        transferRow.appendChild(transferTextarea);

        const transferButtons = document.createElement('div');
        transferButtons.className = 'clm-transfer-buttons';

        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'clm-small-btn';
        exportBtn.textContent = '導出當前設置';
        exportBtn.addEventListener('click', () => {
            transferTextarea.value = JSON.stringify(settings, null, 2);
            transferTextarea.select();
            document.execCommand('copy');
            showToast('設置已複製到剪貼板', 'success');
        });

        const importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = 'clm-small-btn clm-primary-btn';
        importBtn.textContent = '導入設置';
        importBtn.addEventListener('click', () => {
            try {
                const imported = JSON.parse(transferTextarea.value);
                if (imported && typeof imported === 'object') {
                    Object.assign(settings, imported);
                    normalizeSavePresets(settings);
                    showToast('設置導入成功，請點擊保存按鈕', 'success');
                    // 刷新界面顯示
                    transferTextarea.value = JSON.stringify(settings, null, 2);
                } else {
                    showToast('導入失敗：格式不正確', 'error');
                }
            } catch (e) {
                showToast('導入失敗：' + e.message, 'error');
            }
        });

        transferButtons.appendChild(exportBtn);
        transferButtons.appendChild(importBtn);
        transferRow.appendChild(transferButtons);

        body.appendChild(transferRow);

        const footer = document.createElement('div');
        footer.className = 'clm-settings-footer';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'clm-small-btn clm-primary-btn';
        saveBtn.textContent = '保存並關閉';
        saveBtn.addEventListener('click', () => {
            settings.qb.enabled = enableCheckbox.checked;
            saveSettings(settings);
            closePanel();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'clm-small-btn';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => {
            closePanel();
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);

        mask.appendChild(panel);
        mask.addEventListener('click', (e) => {
            if (e.target === mask) {
                closePanel();
            }
        });

        document.body.appendChild(mask);
    }

    function createInputRow(labelText, value, onChange) {
        const row = document.createElement('div');
        row.className = 'clm-form-row';
        const label = document.createElement('label');
        label.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.addEventListener('input', () => {
            onChange(input.value);
        });
        row.appendChild(label);
        row.appendChild(input);
        return row;
    }

    function openPresetPickerDialog(settingsOverride) {
        const settings = settingsOverride || loadSettings();
        normalizeSavePresets(settings);
        const presets = Array.isArray(settings.qb.savePresets) ? settings.qb.savePresets : [];
        if (!settings.qb.enabled) {
            showToast('請先啟用 qBittorrent 集成。', 'warning');
            return Promise.resolve(null);
        }
        if (!presets.length) {
            showToast('請先在設置中新增至少一個儲存位置。', 'warning');
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            const mask = document.createElement('div');
            mask.className = 'clm-preset-picker-mask';

            const panel = document.createElement('div');
            panel.className = 'clm-preset-picker';

            const title = document.createElement('div');
            title.className = 'clm-preset-picker-title';
            title.textContent = '選擇儲存位置';
            panel.appendChild(title);

            const list = document.createElement('div');
            list.className = 'clm-preset-picker-list';

            presets.forEach((preset, index) => {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'clm-preset-picker-option';
                const nameEl = document.createElement('strong');
                nameEl.textContent = preset.name || ('預設路徑 ' + (index + 1));
                const pathEl = document.createElement('span');
                pathEl.textContent = preset.savePath || '使用 qBittorrent 默認路徑';
                option.appendChild(nameEl);
                option.appendChild(pathEl);
                option.addEventListener('click', () => {
                    cleanup();
                    resolve(preset);
                });
                list.appendChild(option);
            });

            panel.appendChild(list);

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'clm-preset-picker-cancel';
            cancelBtn.textContent = '取消';
            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(null);
            });
            panel.appendChild(cancelBtn);

            mask.appendChild(panel);
            document.body.appendChild(mask);

            // 点击 mask 区域（但不是 panel）时关闭
            mask.addEventListener('click', (ev) => {
                if (ev.target === mask) {
                    cleanup();
                    resolve(null);
                }
            });
            
            // 阻止 panel 内的点击事件冒泡到 mask
            panel.addEventListener('click', (ev) => {
                ev.stopPropagation();
            });

            function cleanup() {
                if (mask.parentNode) {
                    mask.parentNode.removeChild(mask);
                }
            }
        });
    }

    async function ensureQbittorrentLogin(baseUrl, qbSettings, options = {}) {
        const { throwOnFail = false } = options;
        if (!qbSettings?.username || !qbSettings?.password) {
            return true;
        }
        const body = new URLSearchParams();
        body.set('username', qbSettings.username);
        body.set('password', qbSettings.password);
        try {
            const resp = await gmCompatibleFetch(baseUrl + '/api/v2/auth/login', {
                method: 'POST',
                credentials: 'include',
                body
            });
            if (!resp.ok) {
                const errMsg = 'HTTP ' + resp.status;
                if (throwOnFail) {
                    throw new Error('登錄失敗：' + errMsg);
                }
                console.error('草榴Manager: qBittorrent 登錄失敗', errMsg);
                return false;
            }
            const text = (await resp.text()).trim().toLowerCase();
            if (text.includes('fail')) {
                if (throwOnFail) {
                    throw new Error('登錄失敗，請確認帳號密碼');
                }
                console.error('草榴Manager: qBittorrent 登錄失敗 - 憑證錯誤');
                return false;
            }
            return true;
        } catch (err) {
            if (throwOnFail) {
                throw err;
            }
            console.error('草榴Manager: qBittorrent 登錄失敗', err);
            return false;
        }
    }

    async function testQbittorrentConnectivity(settings) {
        if (!settings?.qb?.baseUrl) {
            throw new Error('請先填寫 qBittorrent WebUI 地址。');
        }
        const base = settings.qb.baseUrl.replace(/\/+$/, '');
        appendQbLog('開始測試 qBittorrent 連線：' + base, 'info');
        await ensureQbittorrentLogin(base, settings.qb, { throwOnFail: true });
        try {
            const resp = await gmCompatibleFetch(base + '/api/v2/app/version', {
                method: 'GET',
                credentials: 'include'
            });
            if (!resp.ok) {
                throw new Error('HTTP ' + resp.status);
            }
            const version = (await resp.text()).trim();
            appendQbLog('連線測試成功，版本：' + (version || 'Unknown'), 'success');
            return version || 'Unknown';
        } catch (err) {
            const msg = err?.message || err;
            appendQbLog('連線測試失敗：' + msg, 'error');
            throw new Error('連線失敗：' + msg);
        }
    }

    /**
     * 對外導出：調用 qBittorrent 添加種子 / 磁力的函數
     * 可在 console 中調用：
     *   window.草榴ManagerSendToQb('magnet:?xt=urn:btih:....', '某個預設ID');
     */
    async function sendToQbittorrent(torrentSource, presetId) {
        const settings = loadSettings();
        const sourceDescriptor = typeof torrentSource === 'string'
            ? torrentSource
            : (torrentSource?.url || torrentSource?.filename || '');
        const resourceLabel = summarizeResource(sourceDescriptor);
        appendQbLog('收到下載請求：' + resourceLabel, 'info');
        if (!settings.qb.enabled) {
            appendQbLog('qBittorrent 集成未啟用，已取消請求。', 'warning');
            showToast('請先在設置中啟用 qBittorrent 集成。', 'warning');
            return false;
        }
        if (!settings.qb.baseUrl) {
            appendQbLog('未配置 qBittorrent WebUI 地址，已取消請求。', 'warning');
            showToast('請在設置中填寫 qBittorrent WebUI 地址。', 'warning');
            return false;
        }

        const base = settings.qb.baseUrl.replace(/\/+$/, '');
        appendQbLog('使用 WebUI 地址：' + base, 'info');

        try {
            await ensureQbittorrentLogin(base, settings.qb, { throwOnFail: true });
            appendQbLog('與 qBittorrent 會話建立成功。', 'success');
        } catch (err) {
            const msg = err?.message || err;
            appendQbLog('登入 qBittorrent 失敗：' + msg, 'error');
            showToast('登入 qBittorrent 失敗：' + msg, 'error');
            return false;
        }

        let preset = null;
        if (presetId) {
            preset = (settings.qb.savePresets || []).find(p => p.id === presetId);
        }
        if (!preset) {
            preset = settings.qb.savePresets && settings.qb.savePresets[0];
        }

        if (!preset) {
            appendQbLog('沒有可用的儲存位置預設，請先在設置中新增。', 'warning');
            showToast('請先新增儲存位置預設。', 'warning');
            return false;
        }

        appendQbLog('使用儲存預設：' + (preset.name || preset.id || '未命名') +
            (preset.savePath ? ` | 路徑：${preset.savePath}` : ''), 'info');

        const isBinaryPayload = typeof torrentSource === 'object' && !!torrentSource?.torrentBinary;
        let torrentUrl = null;
        let qbPayload = null;

        if (isBinaryPayload) {
            const buffer = ensureArrayBuffer(torrentSource.torrentBinary);
            if (!buffer || !buffer.byteLength) {
                appendQbLog('種子文件內容無效，已取消。', 'error');
                showToast('種子文件內容無效，無法發送。', 'error');
                return false;
            }
            const blob = new Blob([buffer], { type: 'application/x-bittorrent' });
            qbPayload = new FormData();
            qbPayload.append('torrents', blob, torrentSource.filename || 'download.torrent');
            appendQbLog('已取得種子文件，準備以上傳方式提交。', 'info');
        } else {
            torrentUrl = typeof torrentSource === 'string' ? torrentSource : torrentSource?.url;
            if (!torrentUrl) {
                appendQbLog('缺少有效的下載地址，已取消。', 'error');
                showToast('沒有可用的下載地址。', 'error');
                return false;
            }
            qbPayload = new URLSearchParams();
            qbPayload.append('urls', torrentUrl);
            appendQbLog('將以遠程 URL 方式提交種子。', 'info');
        }

        const appendCommonField = (key, value) => {
            if (!value) return;
            qbPayload.append(key, value);
        };
        appendCommonField('category', settings.qb.defaultCategory);
        appendCommonField('savepath', preset.savePath);
        appendCommonField('tags', preset.tags);

        appendQbLog(isBinaryPayload ? '正在以上傳方式向 qBittorrent 發送種子…' : '正在向 qBittorrent 發送下載請求…', 'info');

        // 尝试发送请求，如果失败则重试一次（重新登录后）
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            if (attempt > 0) {
                appendQbLog('請求失敗，嘗試重新登錄後重試…', 'info');
                try {
                    await ensureQbittorrentLogin(base, settings.qb, { throwOnFail: true });
                    appendQbLog('重新登錄成功，正在重試…', 'success');
                } catch (loginErr) {
                    appendQbLog('重新登錄失敗：' + (loginErr?.message || loginErr), 'error');
                    break;
                }
            }

            try {
                const resp = await gmCompatibleFetch(base + '/api/v2/torrents/add', {
                    method: 'POST',
                    credentials: 'include',
                    body: qbPayload
                });
                const bodyText = (await resp.text()).trim();
                const lowered = bodyText.toLowerCase();
                
                if (!resp.ok || lowered.includes('fail')) {
                    const msg = `HTTP ${resp.status}` + (bodyText ? `，響應：${bodyText}` : '');
                    lastError = msg;
                    
                    // 检查是否是任务已存在的情况（HTTP 200 + "Fails."）
                    // qBittorrent 在任务已存在时会返回 HTTP 200 但响应内容是 "Fails."
                    if (resp.status === 200 && (bodyText === 'Fails.' || lowered === 'fails.')) {
                        // 这通常意味着任务已存在，不是真正的错误
                        appendQbLog('qBittorrent 回覆：任務可能已存在（' + bodyText + '）。請在 qBittorrent 客戶端檢查是否已有該下載任務。', 'warning');
                        showToast('任務可能已存在於 qBittorrent 中，請在客戶端確認。', 'warning');
                        return true; // 返回 true，因为这不是真正的错误
                    }
                    
                    // 如果是第一次尝试且响应是"Fails."，尝试重新登录后重试
                    if (attempt === 0 && lowered.includes('fail') && resp.status === 200) {
                        appendQbLog('下載請求被拒：' + msg + '，將嘗試重新登錄後重試…', 'warning');
                        continue; // 重试
                    }
                    
                    // 第二次尝试仍然失败，或者不是认证问题
                    let errorDetail = msg;
                    if (lowered.includes('fail')) {
                        if (!isBinaryPayload && torrentUrl) {
                            errorDetail += '。可能原因：1) 磁力鏈接無效或無法訪問；2) qBittorrent 無法連接到該 URL；3) 種子文件已損壞。';
                        } else if (isBinaryPayload) {
                            errorDetail += '。可能原因：1) 種子文件格式錯誤或已損壞；2) qBittorrent 配置問題。';
                        } else {
                            errorDetail += '。請檢查 qBittorrent 設置和日誌。';
                        }
                    }
                    appendQbLog('下載請求被拒：' + errorDetail, 'error');
                    showToast('發送到 qBittorrent 失敗：' + msg, 'error');
                    return false;
                }
                
                // 成功
                appendQbLog('qBittorrent 回覆成功：' + (bodyText || 'Ok'), 'success');
                showToast('已提交至 qBittorrent，請在客戶端確認。', 'success');
                
                // 在成功响应后 0.5 秒触发跳转到广告页面
                setTimeout(() => {
                    try {
                        // 获取 iframe（通过全局变量或参数传递）
                        const frame = window.clmInlineDownloadWindow?.getFrame?.();
                        if (!frame) {
                            // 静默失败
                            return;
                        }
                        
                        const iframeWindow = frame.contentWindow;
                        const iframeDoc = frame.contentDocument || iframeWindow.document;
                        
                        // 提取 poData
                        let poData = null;
                        
                        // 方法1: 直接从 window 对象获取
                        if (iframeWindow.poData && Array.isArray(iframeWindow.poData) && iframeWindow.poData.length > 0) {
                            poData = iframeWindow.poData;
                        } else {
                            // 方法2: 从 script 标签中提取 poData
                            const scripts = iframeDoc.querySelectorAll('script');
                            for (let script of scripts) {
                                const scriptText = script.textContent || script.innerHTML;
                                // 查找 poJson 的定义（支持单引号和双引号）
                                const poJsonMatch = scriptText.match(/var\s+poJson\s*=\s*['"]([^'"]+)['"]/);
                                if (poJsonMatch) {
                                    try {
                                        // 处理转义字符
                                        let poJson = poJsonMatch[1]
                                            .replace(/\\\//g, '/')
                                            .replace(/\\"/g, '"')
                                            .replace(/\\'/g, "'")
                                            .replace(/\\\\/g, '\\');
                                        const parsed = JSON.parse(poJson);
                                        if (Array.isArray(parsed) && parsed.length > 0) {
                                            poData = parsed;
                                            break;
                                        }
                                    } catch (e) {
                                        console.warn('草榴Manager: 解析 poJson 失败', e);
                                    }
                                }
                            }
                            
                            // 方法3: 如果 poData 为空，尝试从 rmData 获取
                            if (!poData && iframeWindow.rmData && Array.isArray(iframeWindow.rmData) && iframeWindow.rmData.length > 0) {
                                poData = iframeWindow.rmData;
                            }
                        }
                        
                        // 如果找到了 poData，触发跳转
                        if (poData && poData.length > 0) {
                            const randomIndex = Math.floor(Math.random() * poData.length);
                            const adUrl = poData[randomIndex].u;
                            if (adUrl) {
                                console.log('草榴Manager: qBittorrent 成功响应，跳转到广告页面:', adUrl);
                                iframeWindow.location.href = adUrl;
                            }
                        }
                        // 未找到 poData，静默失败
                    } catch (e) {
                        // 跨域错误，静默失败（正常情况，因为 rmdown.com 是跨域 iframe）
                    }
                }, 500); // 0.5秒后触发
                
                return true;
            } catch (e) {
                const msg = e?.message || e;
                lastError = msg;
                console.error('草榴Manager: 發送到 qBittorrent 時出錯', e);
                
                // 如果是第一次尝试，且可能是认证问题，则重试
                if (attempt === 0 && (msg.includes('401') || msg.includes('403') || msg.includes('認證') || msg.includes('登錄'))) {
                    appendQbLog('發送過程發生錯誤：' + msg + '，將嘗試重新登錄後重試…', 'warning');
                    continue; // 重试
                }
                
                // 其他错误或第二次尝试失败
                appendQbLog('發送過程發生錯誤：' + msg, 'error');
                showToast('發送到 qBittorrent 時出錯：' + msg, 'error');
                return false;
            }
        }
        
        // 如果所有重试都失败
        if (lastError) {
            appendQbLog('重試後仍然失敗：' + lastError, 'error');
            showToast('發送到 qBittorrent 失敗：' + lastError, 'error');
        }
        return false;
    }

    // 對外暴露到 window，方便後續與頁面其他腳本集成
    pageWindow.草榴ManagerSendToQb = sendToQbittorrent;

    /**
     * ========================================
     *  暴露核心 API 到 CLM 命名空间
     *  为将来的模块化架构做准备
     * ========================================
     */
    
    // 工具函数
    CLM.isMobilePage = isMobilePage;
    CLM.detectPageType = detectPageType;
    CLM.getAbsoluteUrl = getAbsoluteUrl;
    CLM.normalizeThreadKey = normalizeThreadKey;
    CLM.showToast = showToast;
    CLM.injectStyle = injectStyle;
    
    // 内部工具函数（供远程模块使用）
    pageWindow._CLM_showToast = showToast;
    pageWindow._CLM_ensureToastContainer = ensureToastContainer;
    
    // 核心逻辑函数
    CLM.fetchThreadData = fetchThreadData;
    CLM.openGalleryForThread = openGalleryForThread;
    CLM.createGalleryOverlay = createGalleryOverlay;
    
    // 下载相关函数
    CLM.createInlineDownloadWindow = createInlineDownloadWindow;
    CLM.handleThreadDownloadButtonClick = handleThreadDownloadButtonClick;
    CLM.setupThreadDownloadButton = setupThreadDownloadButton;
    
    // 清晰度相关函数（未迁移）
    CLM.updateQualityBadgeElement = updateQualityBadgeElement;
    
    // qBittorrent 相关函数
    CLM.sendToQbittorrent = sendToQbittorrent;
    CLM.loadSettings = loadSettings;
    CLM.saveSettings = saveSettings;
    
    // 注意：已迁移到 core.js 的函数不再在此暴露
    // 它们将由远程模块加载后自动暴露到 CLM 命名空间
    
    console.log('草榴Manager: 核心函数已暴露到 CLM 命名空间');

    /**
     * ========================================
     *  加载远程模块
     * ========================================
     */
    (async function loadRemoteModules() {
        try {
            console.log('%c草榴Manager: 开始加载远程模块...', 'color: #3b82f6; font-weight: bold;');
            
            // 检查是否需要自动更新
            const shouldAutoUpdate = shouldAutoCheckUpdate();
            if (shouldAutoUpdate) {
                console.log('草榴Manager: 自动检查更新已启用，正在检查更新...');
                updateLastCheckTime();
            }
            
            await initRemoteModules(pageType, shouldAutoUpdate);
            console.log('%c草榴Manager: 远程模块加载完成', 'color: #22c55e; font-weight: bold;');
            
            // 初始化已加载的模块
            console.log('%c草榴Manager: 开始初始化远程模块...', 'color: #3b82f6; font-weight: bold;');
            
            // 初始化 core 模块
            if (typeof CLM.initCoreModule === 'function') {
                CLM.initCoreModule({});
            } else {
                console.warn('草榴Manager: core 模块初始化函数不存在');
            }
            
            // 初始化 desktop 或 mobile 模块
            if (pageType.startsWith('desktop-')) {
                if (typeof CLM.initDesktopModule === 'function') {
                    CLM.initDesktopModule({});
                } else {
                    console.warn('草榴Manager: desktop 模块初始化函数不存在');
                }
            } else if (pageType.startsWith('mobile-')) {
                if (typeof CLM.initMobileModule === 'function') {
                    CLM.initMobileModule({});
                } else {
                    console.warn('草榴Manager: mobile 模块初始化函数不存在');
                }
            }
            
            console.log('%c草榴Manager: 远程模块初始化完成', 'color: #22c55e; font-weight: bold;');
        } catch (err) {
            console.error('草榴Manager: 远程模块加载失败', err);
            // 失败不影响主脚本功能，因为所有功能都已经在主脚本中实现
        }
    })();

    // 在所有匹配頁面中創建右下角設置入口
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createSettingsUI);
    } else {
        createSettingsUI();
    }
})();


