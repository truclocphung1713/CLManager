/**
 * =========================================
 *  手机端模块
 * =========================================
 * 
 * 版本由 manifest.json 统一管理
 * 
 * 包含手机端特定的页面功能：
 * - 搜索页面功能（手机端部分）
 * - 手机端论坛板块功能
 * - 手机端画廊模式样式
 */

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    /**
     * 初始化手机端模块
     * 调用手机端特定的页面功能
     */
    function initMobileModule(ctx) {
        console.log('草榴Manager: mobile 模块已加载');
        
        // 标记模块已加载
        CLM._mobileModuleLoaded = true;
        
        // 调用手机端特定功能
        if (typeof CLM.initSearchPageFeatures === 'function') {
            CLM.initSearchPageFeatures();
        }
        
        if (typeof CLM.initMobileForumFeatures === 'function') {
            CLM.initMobileForumFeatures();
        }
        
        if (typeof CLM.initMobileGalleryStyles === 'function') {
            CLM.initMobileGalleryStyles();
        }
        
        console.log('草榴Manager: mobile 模块初始化完成');
    }

    // ========================================
    // 暴露初始化函数
    // ========================================
    
    CLM.initMobileModule = CLM.initMobileModule || initMobileModule;

    // 如果有待处理的上下文，立即初始化
    if (window.CLM_PENDING_MOBILE_CTX) {
        try {
            initMobileModule(window.CLM_PENDING_MOBILE_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 mobile 模块失败', e);
        }
        delete window.CLM_PENDING_MOBILE_CTX;
    }

})(window);
