/**
 * =========================================
 *  手机端模块（代理层）
 * =========================================
 * 
 * 版本由 manifest.json 统一管理
 * 
 * 这是一个代理层模块，不重复实现任何逻辑。
 * 所有手机端功能已经在主脚本 CLManager.user.js 中实现。
 * 
 * 这个模块的作用：
 * 1. 提供统一的模块初始化接口（initMobileModule）
 * 2. 标记模块已加载状态（CLM._mobileModuleLoaded）
 * 3. 为将来的逻辑迁移提供占位符
 */

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    /**
     * 初始化手机端模块（代理层）
     * 所有手机端功能已经在主脚本中实现
     */
    function initMobileModule(ctx) {
        console.log('草榴Manager: mobile 模块（代理层）已加载');
        
        // 标记模块已加载
        CLM._mobileModuleLoaded = true;
        
        // 手机端功能已经在主脚本中实现：
        // - 手机端板块页面：封面按钮、清晰度徽章、画廊/下载按钮
        // - 手机端画廊手势：滑动翻页、双指缩放、主题抽屉
        // - 手机端评论抽屉：点击按钮展开/收起评论
        // - 手机端样式注入
        // - MutationObserver 监听动态内容
        
        console.log('草榴Manager: mobile 模块代理层初始化完成，所有功能由主脚本提供');
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
