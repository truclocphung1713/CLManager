/**
 * =========================================
 *  核心模块（完整实现）- v2.1.0
 * =========================================
 * 
 * 这个模块包含核心功能的完整实现：
 * - 工具函数
 * - 数据存储（画廊访问记录、下载记录）
 * - 为主脚本提供统一的 API
 */

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    // ========================================
    // 常量配置
    // ========================================
    const GALLERY_VISITED_STORAGE_KEY = '草榴ManagerGalleryVisited';
    const MAX_GALLERY_VISITED_ENTRIES = 400;
    const DOWNLOAD_RECORDS_KEY = '草榴ManagerDownloadedThreads';
    
    // 模块内部状态
    let galleryVisitedCache = null;
    let downloadRecordsCache = null;
    const downloadStatusListeners = new Map();

    // ========================================
    // 工具函数
    // ========================================

    /**
     * 检测是否是手机端页面
     */
    function isMobilePage() {
        const href = window.location.href;
        
        // 优先检查 mobile.php?ismobile 参数
        if (href.indexOf('mobile.php?ismobile=yes') !== -1 || href.indexOf('mobile.php?ismobile=1') !== -1) {
            console.log('草榴Manager[Core]: 检测到手机端 (mobile.php?ismobile=yes)');
            return true;
        }
        if (href.indexOf('mobile.php?ismobile=no') !== -1 || href.indexOf('mobile.php?ismobile=0') !== -1) {
            console.log('草榴Manager[Core]: 检测到电脑端 (mobile.php?ismobile=no)');
            return false;
        }
        
        // 检测URL中是否包含 htm_mob
        if (href.indexOf('/htm_mob/') !== -1) {
            console.log('草榴Manager[Core]: 检测到手机端 (htm_mob)');
            return true;
        }
        
        // 检测viewport meta标签
        const viewportMeta = document.querySelector('meta[name="viewport"]');
        if (viewportMeta && viewportMeta.content.indexOf('user-scalable=no') !== -1) {
            console.log('草榴Manager[Core]: 检测到手机端 (viewport meta)');
            return true;
        }
        
        // 检查是否有手机端特有的DOM结构
        const mobileIndicator = document.querySelector('.mobile-only, #mobile-content, .m-header');
        if (mobileIndicator) {
            console.log('草榴Manager[Core]: 检测到手机端 (DOM结构)');
            return true;
        }
        
        console.log('草榴Manager[Core]: 检测到电脑端 (默认)');
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

    function getAbsoluteUrl(url, base = location.href) {
        if (!url) return null;
        try {
            return new URL(url, base).href;
        } catch (e) {
            console.warn('CLM[Core]: 无法解析 URL', url, e);
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

    function showToast(message, type = 'info', duration = 4000) {
        // Toast 功能需要依赖主脚本的实现
        // 这里调用主脚本版本（如果存在）
        if (typeof window._CLM_showToast === 'function') {
            window._CLM_showToast(message, type, duration);
            return;
        }
        
        // 简化版本
        console.log(`[Toast ${type}]: ${message}`);
    }

    // ========================================
    // 画廊访问记录管理
    // ========================================

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
            console.warn('CLM[Core]: 無法讀取畫廊歷史記錄', err);
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
            console.warn('CLM[Core]: 無法保存畫廊歷史記錄', err);
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

    // ========================================
    // 下载记录管理
    // ========================================

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
            console.warn('CLM[Core]: 無法讀取下載記錄', err);
        }
        return {};
    }

    function getDownloadRecords() {
        if (!downloadRecordsCache) {
            downloadRecordsCache = loadDownloadRecordsFromStorage();
        }
        return downloadRecordsCache;
    }

    function persistDownloadRecords() {
        if (!downloadRecordsCache) {
            downloadRecordsCache = {};
        }
        try {
            localStorage.setItem(DOWNLOAD_RECORDS_KEY, JSON.stringify(downloadRecordsCache));
        } catch (err) {
            console.warn('CLM[Core]: 無法保存下載記錄', err);
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
                console.warn('CLM[Core]: 下載狀態回調失敗', err);
            }
        });
    }

    /**
     * ========================================
     *  初始化核心模块
     * ========================================
     */
    function initCoreModule(ctx) {
        console.log('%c草榴Manager: core 模块（完整实现 v2.1.0）已加载', 'color: #3b82f6; font-weight: bold;');
        
        // 标记模块已加载
        CLM._coreModuleLoaded = true;
        CLM._coreModuleVersion = '2.1.0';
        CLM._remoteModuleLoadTime = Date.now();
        
        // 暴露工具函数（覆盖主脚本版本）
        CLM.isMobilePage = isMobilePage;
        CLM.detectPageType = detectPageType;
        CLM.injectStyle = injectStyle;
        CLM.getAbsoluteUrl = getAbsoluteUrl;
        CLM.normalizeThreadKey = normalizeThreadKey;
        CLM.showToast = showToast;
        
        // 暴露画廊访问记录函数
        CLM.hasGalleryVisitedThread = hasGalleryVisitedThread;
        CLM.markThreadGalleryVisited = markThreadGalleryVisited;
        CLM.bindGalleryVisitedIndicator = bindGalleryVisitedIndicator;
        
        // 暴露下载记录函数
        CLM.hasDownloadedThread = hasDownloadedThread;
        CLM.markThreadDownloaded = markThreadDownloaded;
        CLM.subscribeDownloadStatus = subscribeDownloadStatus;
        
        console.log('✓ 核心工具函数已加载（来自远程模块）');
        console.log('- isMobilePage:', typeof CLM.isMobilePage);
        console.log('- detectPageType:', typeof CLM.detectPageType);
        console.log('- injectStyle:', typeof CLM.injectStyle);
        console.log('- getAbsoluteUrl:', typeof CLM.getAbsoluteUrl);
        console.log('- normalizeThreadKey:', typeof CLM.normalizeThreadKey);
        console.log('- showToast:', typeof CLM.showToast);
        
        console.log('✓ 数据存储函数已加载（来自远程模块）');
        console.log('- hasGalleryVisitedThread:', typeof CLM.hasGalleryVisitedThread);
        console.log('- markThreadGalleryVisited:', typeof CLM.markThreadGalleryVisited);
        console.log('- bindGalleryVisitedIndicator:', typeof CLM.bindGalleryVisitedIndicator);
        console.log('- hasDownloadedThread:', typeof CLM.hasDownloadedThread);
        console.log('- markThreadDownloaded:', typeof CLM.markThreadDownloaded);
        console.log('- subscribeDownloadStatus:', typeof CLM.subscribeDownloadStatus);
        
        console.log('%c草榴Manager: core 模块初始化完成 - 已覆盖 12 个主脚本函数', 'color: #22c55e; font-weight: bold;');
    }

    // 暴露初始化函数
    CLM.initCoreModule = initCoreModule;

    // 如果有待处理的上下文，立即初始化
    if (window.CLM_PENDING_CORE_CTX) {
        try {
            initCoreModule(window.CLM_PENDING_CORE_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 core 模块失败', e);
        }
        delete window.CLM_PENDING_CORE_CTX;
    }

})(window);
