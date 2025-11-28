/**
 * =========================================
 *  桌面端模块
 * =========================================
 * 
 * 版本由 manifest.json 统一管理
 * 
 * 包含桌面端特定的页面功能：
 * - 搜索页面功能
 * - 桌面端论坛板块功能
 */

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    /**
     * 初始化桌面端模块
     * 调用桌面端特定的页面功能
     */
    function initDesktopModule(ctx) {
        console.log('草榴Manager: desktop 模块已加载');
        
        // 标记模块已加载
        CLM._desktopModuleLoaded = true;
        
        // 调用桌面端特定功能
        if (typeof CLM.initSearchPageFeatures === 'function') {
            CLM.initSearchPageFeatures();
        }
        
        if (typeof CLM.initDesktopForumFeatures === 'function') {
            CLM.initDesktopForumFeatures();
        }
        
        console.log('草榴Manager: desktop 模块初始化完成');
    }

    // ========================================
    // 暴露初始化函数和页面功能
    // ========================================
    
    CLM.initDesktopModule = CLM.initDesktopModule || initDesktopModule;

    // 如果有待处理的上下文，立即初始化
    if (window.CLM_PENDING_DESKTOP_CTX) {
        try {
            initDesktopModule(window.CLM_PENDING_DESKTOP_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 desktop 模块失败', e);
        }
        delete window.CLM_PENDING_DESKTOP_CTX;
    }

})(window);
