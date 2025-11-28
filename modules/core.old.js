/**
 * =========================================
 *  核心模块（代理层 + 测试）- v1.0.2
 * =========================================
 * 
 * 这是一个代理层模块，用于测试远程模块加载机制。
 * 所有核心功能已经在主脚本 CLManager.user.js 中实现并暴露到 CLM 命名空间。
 * 
 * 这个模块的作用：
 * 1. 提供统一的模块初始化接口（initCoreModule）
 * 2. 标记模块已加载状态（CLM._coreModuleLoaded）
 * 3. 添加测试函数验证远程模块加载
 * 4. 为将来的逻辑迁移提供占位符
 */

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    /**
     * 测试函数：验证远程模块是否被正确加载
     */
    function testRemoteModuleLoading() {
        console.log('%c✓ 远程 core 模块测试成功', 'color: #22c55e; font-weight: bold; font-size: 14px;');
        console.log('- 模块版本: v1.0.2');
        console.log('- 加载时间:', new Date().toLocaleTimeString());
        console.log('- CLM 命名空间可用:', !!window.CLM);
        console.log('- 主脚本 API 数量:', Object.keys(CLM).length);
        
        // 验证关键 API 是否存在
        const coreAPIs = [
            'fetchThreadData',
            'openGalleryForThread',
            'setupThreadDownloadButton',
            'detectQualityTagFromTitle',
            'resolveQualityTagFromListItem',
            'updateQualityBadgeElement'
        ];
        
        const availableAPIs = coreAPIs.filter(api => typeof CLM[api] === 'function');
        console.log(`- 核心 API 可用: ${availableAPIs.length}/${coreAPIs.length}`);
        
        if (availableAPIs.length === coreAPIs.length) {
            console.log('%c✓ 所有核心 API 验证通过', 'color: #22c55e; font-weight: bold;');
        } else {
            console.warn('⚠ 部分核心 API 缺失:', coreAPIs.filter(api => !availableAPIs.includes(api)));
        }
        
        return true;
    }

    /**
     * 初始化核心模块（代理层）
     * 所有核心函数已经在主脚本中通过 CLM 命名空间暴露
     */
    function initCoreModule(ctx) {
        console.log('%c草榴Manager: core 模块（远程代理层 v1.0.2）已加载', 'color: #3b82f6; font-weight: bold;');
        
        // 标记模块已加载
        CLM._coreModuleLoaded = true;
        CLM._remoteModuleLoadTime = Date.now();
        
        // 运行测试
        testRemoteModuleLoading();
        
        // 核心功能已经在主脚本中实现并暴露到 CLM：
        // - CLM.fetchThreadData
        // - CLM.openGalleryForThread
        // - CLM.createGalleryOverlay
        // - CLM.handleThreadDownloadButtonClick
        // - CLM.detectQualityTagFromTitle
        // - CLM.resolveQualityTagFromListItem
        // - CLM.updateQualityBadgeElement
        // - CLM.setupThreadDownloadButton
        // - CLM.bindGalleryVisitedIndicator
        // - 等等...
        
        console.log('草榴Manager: core 模块代理层初始化完成，所有功能由主脚本提供');
    }

    // 暴露初始化函数
    CLM.initCoreModule = CLM.initCoreModule || initCoreModule;

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
