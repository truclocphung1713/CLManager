// 下载模块
// 处理内联下载窗口、qBittorrent 集成等

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    let downloadCtx = null;

    function initDownloadModule(ctx) {
        if (!ctx) {
            console.warn('草榴Manager: download 模块初始化参数不完整', ctx);
            return;
        }

        downloadCtx = ctx;
        CLM._downloadModuleLoaded = true;
        console.log('草榴Manager: download 模块已加载');
    }

    // 创建内联下载窗口
    function createInlineDownloadWindow(ctx) {
        if (!ctx || typeof ctx.createInlineDownloadWindowFactory !== 'function') {
            console.warn('草榴Manager: createInlineDownloadWindow 缺少工厂函数');
            return null;
        }
        return ctx.createInlineDownloadWindowFactory(ctx);
    }

    CLM.initDownloadModule = CLM.initDownloadModule || initDownloadModule;
    CLM.createInlineDownloadWindow = CLM.createInlineDownloadWindow || function(ctx) {
        return createInlineDownloadWindow(ctx || downloadCtx);
    };

    if (window.CLM_PENDING_DOWNLOAD_CTX) {
        try {
            initDownloadModule(window.CLM_PENDING_DOWNLOAD_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 download 模块失败', e);
        }
        window.CLM_PENDING_DOWNLOAD_CTX = null;
    }

})(window);
