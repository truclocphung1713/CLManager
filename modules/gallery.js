// 画廊相关模块示例
// 真正拆分时，可以把 createGalleryOverlay 相关的逻辑搬到这里，
// 然后通过 IIFE 在加载时自动注册/执行。

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    // 这里将来可以挂载画廊初始化入口，例如：
    // CLM.initGallery = function () { ... };

})(window);
