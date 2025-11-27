// 设置模块
// 处理高级设置功能（预设管理等）

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    function initSettingsModule(ctx) {
        if (!ctx) {
            console.warn('草榴Manager: settings 模块初始化参数不完整');
            return;
        }

        CLM._settingsModuleLoaded = true;
        console.log('草榴Manager: settings 模块已加载');

        // 暴露设置相关函数
        CLM.createPresetPickerDialog = createPresetPickerDialog;
    }

    // 创建预设选择对话框
    function createPresetPickerDialog(presets, onSelect) {
        console.log('草榴Manager: 创建预设选择对话框', presets);
        
        // 简化实现：使用原生 confirm
        // TODO: 实现完整的预设选择对话框
        if (presets && presets.length > 0) {
            const presetNames = presets.map((p, i) => `${i + 1}. ${p.name || p.path}`).join('\n');
            const choice = prompt(`选择下载路径:\n${presetNames}\n\n请输入序号 (1-${presets.length}):`);
            if (choice) {
                const index = parseInt(choice) - 1;
                if (index >= 0 && index < presets.length && onSelect) {
                    onSelect(presets[index].id);
                }
            }
        }
    }

    CLM.initSettingsModule = CLM.initSettingsModule || initSettingsModule;

    if (window.CLM_PENDING_SETTINGS_CTX) {
        try {
            initSettingsModule(window.CLM_PENDING_SETTINGS_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 settings 模块失败', e);
        }
        window.CLM_PENDING_SETTINGS_CTX = null;
    }

})(window);
