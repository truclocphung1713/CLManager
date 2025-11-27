// 设置模块
// 处理右下角设置按钮、qBittorrent 配置面板等

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    let settingsCtx = null;

    function initSettingsModule(ctx) {
        if (!ctx) {
            console.warn('草榴Manager: settings 模块初始化参数不完整', ctx);
            return;
        }

        settingsCtx = ctx;
        CLM._settingsModuleLoaded = true;
        console.log('草榴Manager: settings 模块已加载');
    }

    // 创建设置 UI
    function createSettingsUI(ctx) {
        if (!ctx || typeof ctx.createSettingsUIFactory !== 'function') {
            console.warn('草榴Manager: createSettingsUI 缺少工厂函数');
            return;
        }
        ctx.createSettingsUIFactory(ctx);
    }

    CLM.initSettingsModule = CLM.initSettingsModule || initSettingsModule;
    CLM.createSettingsUI = CLM.createSettingsUI || function(ctx) {
        return createSettingsUI(ctx || settingsCtx);
    };

    if (window.CLM_PENDING_SETTINGS_CTX) {
        try {
            initSettingsModule(window.CLM_PENDING_SETTINGS_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 settings 模块失败', e);
        }
        window.CLM_PENDING_SETTINGS_CTX = null;
    }

})(window);
