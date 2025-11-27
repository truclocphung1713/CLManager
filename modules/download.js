// 下载模块
// 处理内联下载窗口、下载按钮等功能

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    function initDownloadModule(ctx) {
        if (!ctx) {
            console.warn('草榴Manager: download 模块初始化参数不完整');
            return;
        }

        CLM._downloadModuleLoaded = true;
        console.log('草榴Manager: download 模块已加载');

        // 暴露下载相关函数
        CLM.createInlineDownloadWindow = createInlineDownloadWindow;
        CLM.handleThreadDownloadButtonClick = handleThreadDownloadButtonClick;
    }

    // 创建内联下载窗口
    function createInlineDownloadWindow(downloadUrl, threadTitle) {
        console.log('草榴Manager: 创建内联下载窗口', downloadUrl);
        
        // 简化实现：直接打开新标签页
        // TODO: 实现完整的内联下载窗口逻辑
        window.open(downloadUrl, '_blank');
        
        if (CLM.showToast) {
            CLM.showToast('正在打开下载页面...', 'info');
        }
    }

    // 处理下载按钮点击
    function handleThreadDownloadButtonClick(threadUrl, threadTitle) {
        console.log('草榴Manager: 处理下载按钮点击', threadUrl, threadTitle);
        
        // 标记为已下载
        const threadKey = CLM.normalizeThreadKey ? CLM.normalizeThreadKey(threadUrl) : null;
        if (threadKey && CLM.markThreadDownloaded) {
            CLM.markThreadDownloaded(threadKey);
        }
        
        // 打开下载页面
        // TODO: 实现自动解析下载链接的逻辑
        window.open(threadUrl, '_blank');
        
        if (CLM.showToast) {
            CLM.showToast('已标记为已下载', 'success');
        }
    }

    CLM.initDownloadModule = CLM.initDownloadModule || initDownloadModule;

    if (window.CLM_PENDING_DOWNLOAD_CTX) {
        try {
            initDownloadModule(window.CLM_PENDING_DOWNLOAD_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 download 模块失败', e);
        }
        window.CLM_PENDING_DOWNLOAD_CTX = null;
    }

})(window);
