// 手机端相关模块示例
// 将来可以把 isMobilePage / 手机画廊适配 / 手势逻辑等拆到这里，
// 并在模块加载后按页面类型自行初始化。

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    // 例如：
    // CLM.initMobileEnhancements = function () { ... };

    if (!CLM._mobileModuleLoaded) {
        CLM._mobileModuleLoaded = true;
        console.log('草榴Manager: mobile 模塊已加載');
    }

})(window);
