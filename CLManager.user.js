    // ==UserScript==
    // @name         草榴Manager
    // @namespace    http://tampermonkey.net/
    // @version      1.8.0014
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
    // @grant        GM_listValues
    // @grant        unsafeWindow
    // @connect      www.rmdown.com
    // @connect      *
    // @updateURL    https://raw.githubusercontent.com/truclocphung1713/CLManager/refs/heads/main/CLManager.user.js
    // @downloadURL  https://raw.githubusercontent.com/truclocphung1713/CLManager/refs/heads/main/CLManager.user.js
    // ==/UserScript==
    (function () {
        'use strict';

        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

        /**
         * ========================================
         *  核心工具函数
         * ========================================
         */

        /**
         * 检测是否是手机端页面
         */
        function isMobilePage() {
            const href = window.location.href;
            
            if (href.indexOf('mobile.php?ismobile=yes') !== -1 || href.indexOf('mobile.php?ismobile=1') !== -1) {
                return true;
            }
            if (href.indexOf('mobile.php?ismobile=no') !== -1 || href.indexOf('mobile.php?ismobile=0') !== -1) {
                return false;
            }
            
            if (href.indexOf('/htm_mob/') !== -1) {
                return true;
            }
            
            const viewportMeta = document.querySelector('meta[name="viewport"]');
            if (viewportMeta && viewportMeta.content.indexOf('user-scalable=no') !== -1) {
                return true;
            }
            
            const mobileIndicator = document.querySelector('.mobile-only, #mobile-content, .m-header');
            if (mobileIndicator) {
                return true;
            }
            
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
            (document.head || document.getElementsByTagName('head')[0]).appendChild(style);
        }

        /**
         * 获取绝对 URL
         */
        function getAbsoluteUrl(relativeUrl) {
            if (!relativeUrl) return '';
            if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
                return relativeUrl;
            }
            const base = window.location.origin;
            if (relativeUrl.startsWith('/')) {
                return base + relativeUrl;
            }
            const currentPath = window.location.pathname;
            const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
            return base + currentDir + relativeUrl;
        }

        /**
         * 标准化帖子 key
         */
        function normalizeThreadKey(threadUrl) {
            if (!threadUrl) return null;
            const match = threadUrl.match(/\/(\d+)\.html/);
            return match ? match[1] : null;
        }

        /**
         * ========================================
         *  Toast 通知
         * ========================================
         */
        let toastContainer = null;
        let toastStyleInjected = false;

        function showToast(message, type = 'info') {
            if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.className = 'clm-toast-container';
                document.body.appendChild(toastContainer);
                if (!toastStyleInjected) {
                    toastStyleInjected = true;
                    injectStyle(`
                        .clm-toast-container {
                            position: fixed;
                            right: 20px;
                            top: 80px;
                            z-index: 100000;
                            display: flex;
                            flex-direction: column;
                            gap: 10px;
                            pointer-events: none;
                        }
                        .clm-toast {
                            background: rgba(30, 30, 40, 0.95);
                            color: #fff;
                            padding: 12px 20px;
                            border-radius: 8px;
                            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                            font-size: 14px;
                            line-height: 1.5;
                            max-width: 320px;
                            word-wrap: break-word;
                            animation: clm-toast-slide-in 0.3s ease-out;
                            pointer-events: auto;
                            border-left: 4px solid #3b82f6;
                        }
                        .clm-toast.success {
                            border-left-color: #10b981;
                        }
                        .clm-toast.error {
                            border-left-color: #ef4444;
                        }
                        .clm-toast.warning {
                            border-left-color: #f59e0b;
                        }
                        @keyframes clm-toast-slide-in {
                            from {
                                transform: translateX(100%);
                                opacity: 0;
                            }
                            to {
                                transform: translateX(0);
                                opacity: 1;
                            }
                        }
                        @keyframes clm-toast-slide-out {
                            from {
                                transform: translateX(0);
                                opacity: 1;
                            }
                            to {
                                transform: translateX(100%);
                                opacity: 0;
                            }
                        }
                    `);
                }
            }

            const toast = document.createElement('div');
            toast.className = `clm-toast ${type}`;
            toast.textContent = message;
            toastContainer.appendChild(toast);

            setTimeout(() => {
                toast.style.animation = 'clm-toast-slide-out 0.3s ease-in forwards';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, 3000);
        }

        /**
         * ========================================
         *  远程模块加载器
         * ========================================
         */
        const MANIFEST_URL = 'https://raw.githubusercontent.com/truclocphung1713/CLManager/main/manifest.json';
        const MODULE_CACHE_PREFIX = 'CLM_MODULE_';
        const MANIFEST_CACHE_KEY = 'CLM_MANIFEST';

        // 清除指定模块的所有旧版本缓存
        function clearOldModuleVersions(moduleName, currentVersion) {
            try {
                const allKeys = [];
                // 收集所有 GM_getValue 的键
                for (let i = 0; i < 1000; i++) {
                    try {
                        const key = GM_getValue(`__test_key_${i}__`);
                        if (key === undefined) break;
                    } catch (e) {
                        break;
                    }
                }
                
                // 使用 GM_listValues 如果可用
                if (typeof GM_listValues === 'function') {
                    const keys = GM_listValues();
                    keys.forEach(key => {
                        if (key.startsWith(`${MODULE_CACHE_PREFIX}${moduleName}_v`) && !key.endsWith(`_v${currentVersion}`)) {
                            console.log(`草榴Manager: 清除旧版本缓存 ${key}`);
                            GM_deleteValue(key);
                        }
                    });
                }
            } catch (e) {
                console.warn('草榴Manager: 清除旧版本缓存失败', e);
            }
        }

        async function fetchWithCache(url, cacheKey, version) {
            try {
                const cached = GM_getValue(cacheKey);
                if (cached) {
                    console.log(`草榴Manager: 使用缓存 ${cacheKey}`);
                    
                    // 兼容旧缓存格式 {data, timestamp} 和新格式（直接字符串）
                    try {
                        const parsed = JSON.parse(cached);
                        // 如果是旧格式（有 data 和 timestamp 字段）
                        if (parsed && typeof parsed === 'object' && 'data' in parsed) {
                            console.log(`草榴Manager: 检测到旧缓存格式，清除并重新加载 ${cacheKey}`);
                            GM_deleteValue(cacheKey);
                            // 继续执行下面的远程加载逻辑
                        } else {
                            // 新格式：直接返回字符串
                            return parsed;
                        }
                    } catch (e) {
                        // JSON 解析失败，可能是纯字符串，直接返回
                        return cached;
                    }
                }
            } catch (e) {
                console.warn(`草榴Manager: 读取缓存失败 ${cacheKey}`, e);
            }

            return new Promise((resolve, reject) => {
                console.log(`草榴Manager: 从远程加载 ${cacheKey}`);
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url + '?t=' + Date.now(), // 添加时间戳避免 CDN 缓存
                    timeout: 10000,
                    onload: (response) => {
                        if (response.status === 200) {
                            const data = response.responseText;
                            try {
                                GM_setValue(cacheKey, JSON.stringify(data));
                                console.log(`草榴Manager: 缓存已保存 ${cacheKey}`);
                            } catch (e) {
                                console.warn(`草榴Manager: 保存缓存失败 ${cacheKey}`, e);
                            }
                            resolve(data);
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: (error) => reject(error),
                    ontimeout: () => reject(new Error('请求超时'))
                });
            });
        }

        function shouldLoadModuleForPage(moduleTargets, pageType) {
            if (!moduleTargets || !Array.isArray(moduleTargets)) return false;
            return moduleTargets.includes(pageType);
        }

        async function initRemoteModules(pageType) {
            console.log(`草榴Manager: 当前页面类型 = ${pageType}`);

            try {
                const manifestText = await fetchWithCache(MANIFEST_URL, MANIFEST_CACHE_KEY);
                const manifest = JSON.parse(manifestText);
                console.log('草榴Manager: manifest 加载成功', manifest);

                const modulesToLoad = [];
                for (const [moduleName, moduleConfig] of Object.entries(manifest.modules || {})) {
                    if (shouldLoadModuleForPage(moduleConfig.targets, pageType)) {
                        modulesToLoad.push({ name: moduleName, config: moduleConfig });
                    }
                }

                console.log(`草榴Manager: 需要加载 ${modulesToLoad.length} 个模块`, modulesToLoad.map(m => m.name));

                for (const { name, config } of modulesToLoad) {
                    try {
                        // 清除该模块的旧版本缓存
                        clearOldModuleVersions(name, config.version);
                        
                        const cacheKey = `${MODULE_CACHE_PREFIX}${name}_v${config.version}`;
                        const moduleCode = await fetchWithCache(config.url, cacheKey, config.version);
                        console.log(`草榴Manager: 模块 ${name} 加载成功`);
                        
                        const script = document.createElement('script');
                        script.textContent = moduleCode;
                        (document.head || document.body).appendChild(script);
                    } catch (e) {
                        console.warn(`草榴Manager: 模块 ${name} 加载失败`, e);
                    }
                }

                console.log('草榴Manager: 所有模块加载完成');
            } catch (e) {
                console.error('草榴Manager: manifest 加载失败，将使用本地实现', e);
            }
        }

        /**
         * ========================================
         *  数据存储管理
         * ========================================
         */

        // 画廊访问记录
        const GALLERY_VISITED_KEY = '草榴ManagerGalleryVisited';
        const MAX_GALLERY_VISITED_RECORDS = 1000;
        let galleryVisitedCache = null;

        function getGalleryVisitedRecords() {
            if (galleryVisitedCache !== null) {
                return galleryVisitedCache;
            }
            try {
                const stored = localStorage.getItem(GALLERY_VISITED_KEY);
                galleryVisitedCache = stored ? JSON.parse(stored) : {};
            } catch (e) {
                console.error('草榴Manager: 读取画廊访问记录失败', e);
                galleryVisitedCache = {};
            }
            return galleryVisitedCache;
        }

        function persistGalleryVisitedRecords() {
            if (galleryVisitedCache === null) return;
            try {
                localStorage.setItem(GALLERY_VISITED_KEY, JSON.stringify(galleryVisitedCache));
            } catch (e) {
                console.error('草榴Manager: 保存画廊访问记录失败', e);
            }
        }

        function pruneGalleryVisitedRecords(records) {
            const entries = Object.entries(records);
            if (entries.length <= MAX_GALLERY_VISITED_RECORDS) {
                return [];
            }
            entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
            const toKeep = entries.slice(0, MAX_GALLERY_VISITED_RECORDS);
            const removed = entries.slice(MAX_GALLERY_VISITED_RECORDS).map(([key]) => key);
            galleryVisitedCache = Object.fromEntries(toKeep);
            return removed;
        }

        function hasGalleryVisitedThread(threadKey) {
            if (!threadKey) return false;
            const records = getGalleryVisitedRecords();
            return !!records[threadKey];
        }

        function applyVisitedStateToElement(element, visited) {
            if (!element) return;
            const variant = element.dataset.clmGalleryVisitedVariant;
            if (variant === 'cover') {
                element.classList.toggle('clm-gallery-visited-cover', visited);
            } else if (variant === 'title') {
                element.classList.toggle('clm-gallery-visited-title', visited);
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

        // 下载记录
        const DOWNLOAD_RECORDS_KEY = '草榴ManagerDownloadedThreads';
        let downloadRecordsCache = null;
        const downloadStatusListeners = new Map();

        function getDownloadRecords() {
            if (downloadRecordsCache !== null) {
                return downloadRecordsCache;
            }
            try {
                const stored = localStorage.getItem(DOWNLOAD_RECORDS_KEY);
                downloadRecordsCache = stored ? JSON.parse(stored) : {};
            } catch (e) {
                console.error('草榴Manager: 读取下载记录失败', e);
                downloadRecordsCache = {};
            }
            return downloadRecordsCache;
        }

        function persistDownloadRecords() {
            if (downloadRecordsCache === null) return;
            try {
                localStorage.setItem(DOWNLOAD_RECORDS_KEY, JSON.stringify(downloadRecordsCache));
            } catch (e) {
                console.error('草榴Manager: 保存下载记录失败', e);
            }
        }

        function hasDownloadedThread(threadKey) {
            if (!threadKey) return false;
            const records = getDownloadRecords();
            return !!records[threadKey];
        }

        function markThreadDownloaded(threadKey) {
            if (!threadKey) return;
            const records = getDownloadRecords();
            records[threadKey] = Date.now();
            downloadRecordsCache = records;
            persistDownloadRecords();
            notifyDownloadStatusChange(threadKey);
        }

        function subscribeDownloadStatus(threadKey, callback) {
            if (!threadKey || typeof callback !== 'function') return;
            if (!downloadStatusListeners.has(threadKey)) {
                downloadStatusListeners.set(threadKey, []);
            }
            downloadStatusListeners.get(threadKey).push(callback);
        }

        function notifyDownloadStatusChange(threadKey) {
            const listeners = downloadStatusListeners.get(threadKey);
            if (listeners) {
                listeners.forEach(cb => {
                    try {
                        cb();
                    } catch (e) {
                        console.error('草榴Manager: 下载状态监听器执行失败', e);
                    }
                });
            }
        }

        /**
         * ========================================
         *  qBittorrent 设置管理
         * ========================================
         */
        const SETTINGS_KEY = '草榴ManagerSettings';
        const QB_LOG_KEY = '草榴ManagerQbLog';
        const MAX_LOG_ENTRIES = 100;

        function loadSettings() {
            try {
                const stored = localStorage.getItem(SETTINGS_KEY);
                if (stored) {
                    return JSON.parse(stored);
                }
            } catch (e) {
                console.error('草榴Manager: 读取设置失败', e);
            }
            return {
                qb: {
                    enabled: false,
                    host: '',
                    port: '',
                    username: '',
                    password: '',
                    savePresets: []
                }
            };
        }

        function saveSettings(settings) {
            try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            } catch (e) {
                console.error('草榴Manager: 保存设置失败', e);
            }
        }

        function normalizeSavePresets(settings) {
            if (!settings || !settings.qb) return;
            if (!Array.isArray(settings.qb.savePresets)) {
                settings.qb.savePresets = [];
            }
            settings.qb.savePresets = settings.qb.savePresets.filter(p => p && typeof p === 'object' && p.id && p.path);
        }

        function getQbLog() {
            try {
                const stored = localStorage.getItem(QB_LOG_KEY);
                return stored ? JSON.parse(stored) : [];
            } catch (e) {
                console.error('草榴Manager: 读取 qBittorrent 日志失败', e);
                return [];
            }
        }

        function appendQbLog(message, type = 'info') {
            const log = getQbLog();
            log.push({
                timestamp: new Date().toISOString(),
                type,
                message
            });
            if (log.length > MAX_LOG_ENTRIES) {
                log.splice(0, log.length - MAX_LOG_ENTRIES);
            }
            try {
                localStorage.setItem(QB_LOG_KEY, JSON.stringify(log));
            } catch (e) {
                console.error('草榴Manager: 保存 qBittorrent 日志失败', e);
            }
        }

        function clearQbLog() {
            try {
                localStorage.removeItem(QB_LOG_KEY);
            } catch (e) {
                console.error('草榴Manager: 清除 qBittorrent 日志失败', e);
            }
        }

        /**
         * ========================================
         *  qBittorrent API
         * ========================================
         */
        async function sendToQbittorrent(magnetOrTorrentUrl, presetId) {
            const settings = loadSettings();
            if (!settings.qb.enabled) {
                showToast('請先在設置中啟用 qBittorrent 集成', 'warning');
                return false;
            }

            normalizeSavePresets(settings);
            const presets = settings.qb.savePresets;
            let savePath = '';
            
            if (presetId) {
                const preset = presets.find(p => p.id === presetId);
                if (preset) {
                    savePath = preset.path;
                } else {
                    appendQbLog(`未找到預設 ID: ${presetId}`, 'warning');
                }
            }

            if (!savePath && presets.length > 0) {
                savePath = presets[0].path;
                appendQbLog(`使用第一個預設路徑: ${savePath}`, 'info');
            }

            const baseUrl = `http://${settings.qb.host}:${settings.qb.port}`;
            appendQbLog(`準備發送到 qBittorrent: ${baseUrl}`, 'info');
            appendQbLog(`磁力/種子: ${magnetOrTorrentUrl.substring(0, 100)}...`, 'info');
            if (savePath) {
                appendQbLog(`儲存路徑: ${savePath}`, 'info');
            }

            let lastError = null;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    // 登录
                    const loginResult = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: `${baseUrl}/api/v2/auth/login`,
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            data: `username=${encodeURIComponent(settings.qb.username)}&password=${encodeURIComponent(settings.qb.password)}`,
                            timeout: 10000,
                            onload: (response) => {
                                if (response.status === 200 && response.responseText === 'Ok.') {
                                    resolve(true);
                                } else {
                                    reject(new Error(`登錄失敗: ${response.status} ${response.responseText}`));
                                }
                            },
                            onerror: (error) => reject(error),
                            ontimeout: () => reject(new Error('登錄請求超時'))
                        });
                    });

                    appendQbLog('登錄成功', 'success');

                    // 添加种子/磁力
                    const formData = new URLSearchParams();
                    if (magnetOrTorrentUrl.startsWith('magnet:')) {
                        formData.append('urls', magnetOrTorrentUrl);
                    } else {
                        formData.append('urls', magnetOrTorrentUrl);
                    }
                    if (savePath) {
                        formData.append('savepath', savePath);
                    }

                    const addResult = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: `${baseUrl}/api/v2/torrents/add`,
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            data: formData.toString(),
                            timeout: 15000,
                            onload: (response) => {
                                if (response.status === 200 && response.responseText === 'Ok.') {
                                    resolve(true);
                                } else {
                                    reject(new Error(`添加失敗: ${response.status} ${response.responseText}`));
                                }
                            },
                            onerror: (error) => reject(error),
                            ontimeout: () => reject(new Error('添加請求超時'))
                        });
                    });

                    appendQbLog('添加成功', 'success');
                    showToast('已成功發送到 qBittorrent', 'success');
                    return true;

                } catch (error) {
                    lastError = error.message || String(error);
                    const msg = lastError;
                    
                    if (attempt === 0 && (msg.includes('401') || msg.includes('403') || msg.includes('認證') || msg.includes('登錄'))) {
                        appendQbLog('發送過程發生錯誤：' + msg + '，將嘗試重新登錄後重試…', 'warning');
                        continue;
                    }
                    
                    appendQbLog('發送過程發生錯誤：' + msg, 'error');
                    showToast('發送到 qBittorrent 時出錯：' + msg, 'error');
                    return false;
                }
            }
            
            if (lastError) {
                appendQbLog('重試後仍然失敗：' + lastError, 'error');
                showToast('發送到 qBittorrent 失敗：' + lastError, 'error');
            }
            return false;
        }

        // 对外暴露
        pageWindow.草榴ManagerSendToQb = sendToQbittorrent;

        /**
         * ========================================
         *  设置面板 UI
         * ========================================
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
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    transition: all 0.2s ease;
                }
                .clm-settings-btn:hover {
                    background: rgba(0, 0, 0, 0.85);
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
                }
                .clm-settings-mask {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.6);
                    z-index: 10002;
                    display: none;
                    align-items: center;
                    justify-content: center;
                }
                .clm-settings-mask.active {
                    display: flex;
                }
                .clm-settings-panel {
                    background: #fff;
                    border-radius: 12px;
                    width: 90%;
                    max-width: 600px;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                }
                .clm-settings-header {
                    padding: 20px 24px;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .clm-settings-title {
                    font-size: 18px;
                    font-weight: 700;
                    color: #111827;
                }
                .clm-settings-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    color: #6b7280;
                    cursor: pointer;
                    padding: 0;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                    transition: all 0.2s;
                }
                .clm-settings-close:hover {
                    background: #f3f4f6;
                    color: #111827;
                }
                .clm-settings-body {
                    padding: 24px;
                }
                .clm-settings-section {
                    margin-bottom: 24px;
                }
                .clm-settings-section-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #374151;
                    margin-bottom: 12px;
                }
                .clm-form-row {
                    margin-bottom: 16px;
                }
                .clm-form-row label {
                    display: block;
                    font-size: 13px;
                    color: #4b5563;
                    margin-bottom: 6px;
                }
                .clm-form-row input[type="text"],
                .clm-form-row input[type="password"],
                .clm-form-row textarea {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    font-size: 13px;
                    box-sizing: border-box;
                }
                .clm-form-row input[type="checkbox"] {
                    margin-right: 8px;
                }
                .clm-small-btn {
                    padding: 6px 12px;
                    font-size: 12px;
                    border-radius: 6px;
                    border: 1px solid #d1d5db;
                    background: #fff;
                    color: #374151;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-right: 8px;
                }
                .clm-small-btn:hover {
                    background: #f9fafb;
                    border-color: #9ca3af;
                }
                .clm-primary-btn {
                    background: #3b82f6;
                    color: #fff;
                    border-color: #3b82f6;
                }
                .clm-primary-btn:hover {
                    background: #2563eb;
                    border-color: #2563eb;
                }
                .clm-settings-footer {
                    padding: 16px 24px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }
                .clm-log-viewer {
                    background: #1f2937;
                    color: #f3f4f6;
                    padding: 12px;
                    border-radius: 6px;
                    font-family: 'Courier New', monospace;
                    font-size: 11px;
                    max-height: 200px;
                    overflow-y: auto;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
            `);

            const btn = document.createElement('button');
            btn.className = 'clm-settings-btn';
            btn.textContent = '草榴Manager 設置';

            const mask = document.createElement('div');
            mask.className = 'clm-settings-mask';

            const panel = document.createElement('div');
            panel.className = 'clm-settings-panel';

            const header = document.createElement('div');
            header.className = 'clm-settings-header';
            const title = document.createElement('div');
            title.className = 'clm-settings-title';
            title.textContent = '草榴Manager 設置';
            const closeBtn = document.createElement('button');
            closeBtn.className = 'clm-settings-close';
            closeBtn.textContent = '×';
            header.appendChild(title);
            header.appendChild(closeBtn);

            const body = document.createElement('div');
            body.className = 'clm-settings-body';

            const settings = loadSettings();

            // qBittorrent 设置
            const qbSection = document.createElement('div');
            qbSection.className = 'clm-settings-section';
            const qbTitle = document.createElement('div');
            qbTitle.className = 'clm-settings-section-title';
            qbTitle.textContent = 'qBittorrent 集成';
            qbSection.appendChild(qbTitle);

            const enableRow = document.createElement('div');
            enableRow.className = 'clm-form-row';
            const enableLabel = document.createElement('label');
            const enableCheckbox = document.createElement('input');
            enableCheckbox.type = 'checkbox';
            enableCheckbox.checked = settings.qb.enabled;
            enableLabel.appendChild(enableCheckbox);
            enableLabel.appendChild(document.createTextNode('啟用 qBittorrent 集成'));
            enableRow.appendChild(enableLabel);
            qbSection.appendChild(enableRow);

            const hostRow = document.createElement('div');
            hostRow.className = 'clm-form-row';
            const hostLabel = document.createElement('label');
            hostLabel.textContent = 'qBittorrent 主機地址';
            const hostInput = document.createElement('input');
            hostInput.type = 'text';
            hostInput.value = settings.qb.host || '';
            hostInput.placeholder = '例如: 192.168.1.100';
            hostRow.appendChild(hostLabel);
            hostRow.appendChild(hostInput);
            qbSection.appendChild(hostRow);

            const portRow = document.createElement('div');
            portRow.className = 'clm-form-row';
            const portLabel = document.createElement('label');
            portLabel.textContent = 'qBittorrent 端口';
            const portInput = document.createElement('input');
            portInput.type = 'text';
            portInput.value = settings.qb.port || '';
            portInput.placeholder = '例如: 8080';
            portRow.appendChild(portLabel);
            portRow.appendChild(portInput);
            qbSection.appendChild(portRow);

            const usernameRow = document.createElement('div');
            usernameRow.className = 'clm-form-row';
            const usernameLabel = document.createElement('label');
            usernameLabel.textContent = '用戶名';
            const usernameInput = document.createElement('input');
            usernameInput.type = 'text';
            usernameInput.value = settings.qb.username || '';
            usernameRow.appendChild(usernameLabel);
            usernameRow.appendChild(usernameInput);
            qbSection.appendChild(usernameRow);

            const passwordRow = document.createElement('div');
            passwordRow.className = 'clm-form-row';
            const passwordLabel = document.createElement('label');
            passwordLabel.textContent = '密碼';
            const passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.value = settings.qb.password || '';
            passwordRow.appendChild(passwordLabel);
            passwordRow.appendChild(passwordInput);
            qbSection.appendChild(passwordRow);

            body.appendChild(qbSection);

            // 日志查看器
            const logSection = document.createElement('div');
            logSection.className = 'clm-settings-section';
            const logTitle = document.createElement('div');
            logTitle.className = 'clm-settings-section-title';
            logTitle.textContent = 'qBittorrent 操作日誌';
            logSection.appendChild(logTitle);

            const logViewer = document.createElement('div');
            logViewer.className = 'clm-log-viewer';
            const log = getQbLog();
            logViewer.textContent = log.length > 0 
                ? log.map(entry => `[${entry.timestamp}] [${entry.type.toUpperCase()}] ${entry.message}`).join('\n')
                : '暫無日誌記錄';
            logSection.appendChild(logViewer);

            const logButtons = document.createElement('div');
            logButtons.style.marginTop = '12px';
            const clearLogBtn = document.createElement('button');
            clearLogBtn.className = 'clm-small-btn';
            clearLogBtn.textContent = '清除日誌';
            clearLogBtn.addEventListener('click', () => {
                clearQbLog();
                logViewer.textContent = '暫無日誌記錄';
                showToast('日誌已清除', 'success');
            });
            logButtons.appendChild(clearLogBtn);
            logSection.appendChild(logButtons);

            body.appendChild(logSection);

            // 模块管理
            const moduleSection = document.createElement('div');
            moduleSection.className = 'clm-settings-section';
            const moduleTitle = document.createElement('div');
            moduleTitle.className = 'clm-settings-section-title';
            moduleTitle.textContent = '模塊管理';
            moduleSection.appendChild(moduleTitle);

            const moduleInfo = document.createElement('div');
            moduleInfo.style.fontSize = '12px';
            moduleInfo.style.color = '#6b7280';
            moduleInfo.style.marginBottom = '12px';
            moduleInfo.textContent = '当前版本: 1.8.0014 | 模块基于版本号缓存，更新时自动清除旧版本';
            moduleSection.appendChild(moduleInfo);

            const moduleButtons = document.createElement('div');
            moduleButtons.style.display = 'flex';
            moduleButtons.style.gap = '8px';
            
            const checkUpdateBtn = document.createElement('button');
            checkUpdateBtn.className = 'clm-small-btn clm-primary-btn';
            checkUpdateBtn.textContent = '檢查模塊更新';
            checkUpdateBtn.addEventListener('click', async () => {
                checkUpdateBtn.disabled = true;
                checkUpdateBtn.textContent = '檢查中...';
                
                try {
                    // 清除所有模块缓存
                    const keys = [];
                    
                    // 使用 GM_listValues 获取所有存储的键
                    if (typeof GM_listValues === 'function') {
                        const allKeys = GM_listValues();
                        allKeys.forEach(key => {
                            if (key && (key.startsWith('CLM_MODULE_') || key === 'CLM_MANIFEST')) {
                                keys.push(key);
                            }
                        });
                    }
                    
                    console.log('草榴Manager: 准备清除缓存', keys);
                    
                    keys.forEach(key => {
                        try {
                            GM_deleteValue(key);
                            console.log('草榴Manager: 已清除', key);
                        } catch (e) {
                            console.warn('草榴Manager: 清除緩存失敗', key, e);
                        }
                    });
                    
                    showToast(`已清除 ${keys.length} 個模塊緩存，請刷新頁面加載最新版本`, 'success');
                    
                    setTimeout(() => {
                        checkUpdateBtn.disabled = false;
                        checkUpdateBtn.textContent = '檢查模塊更新';
                    }, 2000);
                } catch (e) {
                    console.error('草榴Manager: 檢查更新失敗', e);
                    showToast('檢查更新失敗: ' + e.message, 'error');
                    checkUpdateBtn.disabled = false;
                    checkUpdateBtn.textContent = '檢查模塊更新';
                }
            });
            moduleButtons.appendChild(checkUpdateBtn);
            
            const reloadBtn = document.createElement('button');
            reloadBtn.className = 'clm-small-btn';
            reloadBtn.textContent = '刷新頁面';
            reloadBtn.addEventListener('click', () => {
                window.location.reload();
            });
            moduleButtons.appendChild(reloadBtn);
            
            moduleSection.appendChild(moduleButtons);
            body.appendChild(moduleSection);

            const footer = document.createElement('div');
            footer.className = 'clm-settings-footer';

            const saveBtn = document.createElement('button');
            saveBtn.className = 'clm-small-btn clm-primary-btn';
            saveBtn.textContent = '保存並關閉';
            saveBtn.addEventListener('click', () => {
                settings.qb.enabled = enableCheckbox.checked;
                settings.qb.host = hostInput.value.trim();
                settings.qb.port = portInput.value.trim();
                settings.qb.username = usernameInput.value.trim();
                settings.qb.password = passwordInput.value;
                saveSettings(settings);
                mask.classList.remove('active');
                showToast('設置已保存', 'success');
            });

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'clm-small-btn';
            cancelBtn.textContent = '取消';
            cancelBtn.addEventListener('click', () => {
                mask.classList.remove('active');
            });

            footer.appendChild(cancelBtn);
            footer.appendChild(saveBtn);

            panel.appendChild(header);
            panel.appendChild(body);
            panel.appendChild(footer);
            mask.appendChild(panel);

            btn.addEventListener('click', () => {
                mask.classList.add('active');
            });

            closeBtn.addEventListener('click', () => {
                mask.classList.remove('active');
            });

            mask.addEventListener('click', (e) => {
                if (e.target === mask) {
                    mask.classList.remove('active');
                }
            });

            document.body.appendChild(btn);
            document.body.appendChild(mask);
        }

        /**
         * ========================================
         *  初始化
         * ========================================
         */
        const pageType = detectPageType();
        
        // 初始化远程模块
        initRemoteModules(pageType).then(() => {
            console.log('草榴Manager: 开始初始化模块上下文');
            
            // 暴露工具函数到全局 CLM 命名空间
            if (!window.CLM) {
                window.CLM = {};
            }
            
            // 暴露核心工具函数
            window.CLM.isMobilePage = isMobilePage;
            window.CLM.injectStyle = injectStyle;
            window.CLM.getAbsoluteUrl = getAbsoluteUrl;
            window.CLM.normalizeThreadKey = normalizeThreadKey;
            window.CLM.showToast = showToast;
            
            // 暴露数据管理函数
            window.CLM.hasGalleryVisitedThread = hasGalleryVisitedThread;
            window.CLM.markThreadGalleryVisited = markThreadGalleryVisited;
            window.CLM.applyVisitedStateToElement = applyVisitedStateToElement;
            window.CLM.hasDownloadedThread = hasDownloadedThread;
            window.CLM.markThreadDownloaded = markThreadDownloaded;
            window.CLM.subscribeDownloadStatus = subscribeDownloadStatus;
            
            // 暴露 qBittorrent 函数
            window.CLM.sendToQbittorrent = sendToQbittorrent;
            window.CLM.loadSettings = loadSettings;
            window.CLM.saveSettings = saveSettings;
            
            console.log('草榴Manager: 核心函数已暴露到 CLM 命名空间');
            
            // 初始化各个模块
            const moduleCtx = {
                isMobilePage,
                injectStyle,
                getAbsoluteUrl,
                normalizeThreadKey,
                showToast,
                hasGalleryVisitedThread,
                markThreadGalleryVisited,
                applyVisitedStateToElement,
                hasDownloadedThread,
                markThreadDownloaded,
                subscribeDownloadStatus,
                sendToQbittorrent,
                loadSettings,
                saveSettings
            };
            
            // 调用模块初始化函数
            console.log('草榴Manager: 检查模块初始化函数', {
                initForumModule: typeof window.CLM.initForumModule,
                initSearchModule: typeof window.CLM.initSearchModule,
                initDownloadModule: typeof window.CLM.initDownloadModule,
                initSettingsModule: typeof window.CLM.initSettingsModule,
                initGalleryModule: typeof window.CLM.initGalleryModule,
                initMobileModule: typeof window.CLM.initMobileModule
            });
            
            if (typeof window.CLM.initForumModule === 'function') {
                try {
                    window.CLM.initForumModule(moduleCtx);
                    console.log('草榴Manager: Forum 模块已初始化');
                } catch (e) {
                    console.warn('草榴Manager: Forum 模块初始化失败', e);
                }
            } else {
                console.warn('草榴Manager: initForumModule 不是函数', typeof window.CLM.initForumModule);
            }
            
            if (typeof window.CLM.initSearchModule === 'function') {
                try {
                    window.CLM.initSearchModule(moduleCtx);
                    console.log('草榴Manager: Search 模块已初始化');
                } catch (e) {
                    console.warn('草榴Manager: Search 模块初始化失败', e);
                }
            }
            
            if (typeof window.CLM.initDownloadModule === 'function') {
                try {
                    window.CLM.initDownloadModule(moduleCtx);
                    console.log('草榴Manager: Download 模块已初始化');
                } catch (e) {
                    console.warn('草榴Manager: Download 模块初始化失败', e);
                }
            }
            
            if (typeof window.CLM.initSettingsModule === 'function') {
                try {
                    window.CLM.initSettingsModule(moduleCtx);
                    console.log('草榴Manager: Settings 模块已初始化');
                } catch (e) {
                    console.warn('草榴Manager: Settings 模块初始化失败', e);
                }
            }
            
            if (typeof window.CLM.initGalleryModule === 'function') {
                try {
                    window.CLM.initGalleryModule(moduleCtx);
                    console.log('草榴Manager: Gallery 模块已初始化');
                } catch (e) {
                    console.warn('草榴Manager: Gallery 模块初始化失败', e);
                }
            }
            
            if (typeof window.CLM.initMobileModule === 'function') {
                try {
                    window.CLM.initMobileModule(moduleCtx);
                    console.log('草榴Manager: Mobile 模块已初始化');
                } catch (e) {
                    console.warn('草榴Manager: Mobile 模块初始化失败', e);
                }
            }
        });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createSettingsUI);
        } else {
            createSettingsUI();
        }
    })();
