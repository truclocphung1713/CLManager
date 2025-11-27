// 板块页面模块
// 处理 thread0806.php 页面的封面预览、画质徽章等

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    let forumCtx = null;

    function initForumModule(ctx) {
        if (!ctx) {
            console.warn('草榴Manager: forum 模块初始化参数不完整', ctx);
            return;
        }

        forumCtx = ctx;
        CLM._forumModuleLoaded = true;
        console.log('草榴Manager: forum 模块已加载');
    }

    // 初始化板块页面
    function initForumPage(ctx) {
        if (!ctx || typeof ctx.initForumPageFactory !== 'function') {
            console.warn('草榴Manager: initForumPage 缺少工厂函数');
            return;
        }
        ctx.initForumPageFactory(ctx);
    }

    CLM.initForumModule = CLM.initForumModule || initForumModule;
    CLM.initForumPage = CLM.initForumPage || function(ctx) {
        return initForumPage(ctx || forumCtx);
    };

    if (window.CLM_PENDING_FORUM_CTX) {
        try {
            initForumModule(window.CLM_PENDING_FORUM_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 forum 模块失败', e);
        }
        window.CLM_PENDING_FORUM_CTX = null;
    }

})(window);
