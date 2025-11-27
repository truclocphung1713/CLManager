// 核心公共模块示例
// 这里将来可以放：
// - 网络请求封装（如果不想用主脚本里的 fetchCrossOriginText）
// - 通用日志函数
// - 通用 DOM 工具等

(function (window) {
    'use strict';

    // 示例：对外暴露一个命名空间，避免污染全局
    const CLM = window.CLM || (window.CLM = {});

    CLM.version = CLM.version || '1.0.0-modular';

    // 在这里添加公共方法，例如：
    // CLM.log = function (...args) {
    //     console.log('[CLM]', ...args);
    // };

})(window);
