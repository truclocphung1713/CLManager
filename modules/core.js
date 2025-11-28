/**
 * =========================================
 *  核心模块（完整实现）- v2.0.0
 * =========================================
 * 
 * 这个模块包含所有核心功能的完整实现。
 * 主脚本将逐步迁移功能到此模块。
 */

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

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

    /**
     * ========================================
     *  初始化核心模块
     * ========================================
     */
    function initCoreModule(ctx) {
        console.log('%c草榴Manager: core 模块（完整实现 v2.0.0）已加载', 'color: #3b82f6; font-weight: bold;');
        
        // 标记模块已加载
        CLM._coreModuleLoaded = true;
        CLM._coreModuleVersion = '2.0.0';
        CLM._remoteModuleLoadTime = Date.now();
        
        // 暴露工具函数（覆盖主脚本版本）
        CLM.isMobilePage = isMobilePage;
        CLM.detectPageType = detectPageType;
        CLM.injectStyle = injectStyle;
        CLM.getAbsoluteUrl = getAbsoluteUrl;
        CLM.normalizeThreadKey = normalizeThreadKey;
        CLM.showToast = showToast;
        
        console.log('✓ 核心工具函数已加载（来自远程模块）');
        console.log('- isMobilePage:', typeof CLM.isMobilePage);
        console.log('- detectPageType:', typeof CLM.detectPageType);
        console.log('- injectStyle:', typeof CLM.injectStyle);
        console.log('- getAbsoluteUrl:', typeof CLM.getAbsoluteUrl);
        console.log('- normalizeThreadKey:', typeof CLM.normalizeThreadKey);
        console.log('- showToast:', typeof CLM.showToast);
        
        console.log('草榴Manager: core 模块初始化完成');
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
