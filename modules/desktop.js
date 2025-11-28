/**
 * =========================================
 *  桌面端模块（代理层）- v1.0.2
 * =========================================
 * 
 * 这是一个代理层模块，不重复实现任何逻辑。
 * 所有桌面端功能已经在主脚本 CLManager.user.js 中实现。
 * 
 * 这个模块的作用：
 * 1. 提供统一的模块初始化接口（initDesktopModule）
 * 2. 标记模块已加载状态（CLM._desktopModuleLoaded）
 * 3. 为将来的逻辑迁移提供占位符
 */

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    /**
     * 初始化桌面端模块（代理层）
     * 所有桌面端功能已经在主脚本中实现
     */
    function initDesktopModule(ctx) {
        console.log('草榴Manager: desktop 模块（代理层 v1.0.2）已加载');
        
        // 标记模块已加载
        CLM._desktopModuleLoaded = true;
        
        // 桌面端功能已经在主脚本中实现：
        // - 论坛板块页面：封面按钮、清晰度徽章、画廊/下载按钮
        // - 搜索页面：标题链接点击打开画廊
        // - 帖子详情页：相关增强功能
        // - attachCoverDownloadButtons()
        // - attachTextOnlyQualityBadges()
        // - MutationObserver 监听动态内容
        
        console.log('草榴Manager: desktop 模块代理层初始化完成，所有功能由主脚本提供');
    }

    // ========================================
    // 暴露初始化函数
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
