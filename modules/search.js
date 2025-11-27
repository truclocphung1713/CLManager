// 搜索页面模块
// 处理 search.php 页面的卡片布局、封面预览、画质徽章等

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    let searchCtx = null;

    function initSearchModule(ctx) {
        if (!ctx) {
            console.warn('草榴Manager: search 模块初始化参数不完整', ctx);
            return;
        }

        searchCtx = ctx;
        CLM._searchModuleLoaded = true;
        console.log('草榴Manager: search 模块已加载');
    }

    // 搜索对话框
    function createSearchDialog(ctx) {
        if (!ctx || typeof ctx.createSearchDialogFactory !== 'function') {
            console.warn('草榴Manager: createSearchDialog 缺少工厂函数');
            return null;
        }
        return ctx.createSearchDialogFactory(ctx);
    }

    // 初始化搜索页面
    function initSearchPage(ctx) {
        if (!ctx || typeof ctx.initSearchPageFactory !== 'function') {
            console.warn('草榴Manager: initSearchPage 缺少工厂函数');
            return;
        }
        ctx.initSearchPageFactory(ctx);
    }

    CLM.initSearchModule = CLM.initSearchModule || initSearchModule;
    CLM.createSearchDialog = CLM.createSearchDialog || function(ctx) {
        return createSearchDialog(ctx || searchCtx);
    };
    CLM.initSearchPage = CLM.initSearchPage || function(ctx) {
        return initSearchPage(ctx || searchCtx);
    };

    if (window.CLM_PENDING_SEARCH_CTX) {
        try {
            initSearchModule(window.CLM_PENDING_SEARCH_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 search 模块失败', e);
        }
        window.CLM_PENDING_SEARCH_CTX = null;
    }

})(window);
