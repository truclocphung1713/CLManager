// 搜索页面模块
// 处理 search.php 页面的卡片布局、封面预览、画质徽章等

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    function initSearchModule(ctx) {
        if (!ctx) {
            console.warn('草榴Manager: search 模块初始化参数不完整');
            return;
        }

        CLM._searchModuleLoaded = true;
        console.log('草榴Manager: search 模块已加载');

        // 自动初始化搜索页面
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => initSearchPage());
        } else {
            initSearchPage();
        }
    }

    // 注入搜索页面 CSS
    function injectSearchStyles() {
        if (!CLM.injectStyle) {
            console.warn('草榴Manager: injectStyle 函数不可用');
            return;
        }

        CLM.injectStyle(`
            /* 隐藏原有的表格布局 */
            div.t table {
                display: none !important;
            }
            
            /* 创建卡片网格容器 */
            .clm-search-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 16px;
                padding: 16px;
                max-width: 1400px;
                margin: 0 auto;
            }
            
            /* 搜索结果卡片 */
            .clm-search-item {
                background: #fff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
                display: flex;
                flex-direction: column;
            }
            
            .clm-search-item:hover {
                transform: translateY(-4px);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            }
            
            /* 封面容器 */
            .clm-search-cover {
                width: 100%;
                height: 280px;
                background: #f3f4f6;
                position: relative;
                overflow: visible;
            }
            
            .clm-search-cover img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.2s ease-in-out;
                transform-origin: center center;
            }
            
            /* 电脑端封面放大效果 */
            .clm-search-cover:not(.clm-mobile-search):hover img {
                transform: scale(2);
                position: relative;
                z-index: 9999;
                box-shadow: 0 0 16px rgba(0, 0, 0, 0.7);
                border: 2px solid #ffffff;
            }
            
            .clm-search-cover-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                color: #9ca3af;
                font-size: 12px;
                text-align: center;
                padding: 8px;
            }
            
            /* 搜索页使用与板块页相同的按钮样式 */
            .clm-search-cover .clm-cover-gallery-btn {
                position: absolute;
                left: 50%;
                bottom: 30%;
                transform: translateX(-50%);
                padding: 8px 16px;
                font-size: 13px;
                font-weight: 600;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.6);
                background: rgba(0, 0, 0, 0.85);
                color: #fff;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                z-index: 10;
                white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                transition: background 0.15s ease-in-out;
                pointer-events: auto;
            }
            
            .clm-search-cover .clm-cover-gallery-btn:hover {
                background: rgba(0, 0, 0, 0.95);
            }
            
            .clm-search-cover .clm-cover-download {
                position: absolute;
                top: 8px;
                right: 8px;
                padding: 4px 8px;
                font-size: 11px;
                border-radius: 4px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgba(0, 0, 0, 0.7);
                color: #fff;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                z-index: 10;
                transition: background 0.15s ease-in-out;
                pointer-events: auto;
            }
            
            .clm-search-cover .clm-cover-download.clm-downloaded {
                background: rgba(16, 185, 129, 0.9);
                border-color: rgba(255, 255, 255, 0.55);
            }
            
            .clm-search-cover .clm-cover-download::before {
                content: '⬇';
                font-size: inherit;
            }
            
            .clm-search-cover .clm-cover-download:hover {
                background: rgba(0, 0, 0, 0.9);
            }
            
            .clm-search-cover .clm-cover-quality {
                position: absolute;
                left: 8px;
                top: 8px;
                z-index: 10;
                max-width: 55px;
                font-size: 9px;
                padding: 2px 5px;
                pointer-events: none;
            }
            
            /* 文本信息区域 */
            .clm-search-text {
                padding: 12px;
                background: #fff;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .clm-search-title {
                font-size: 14px;
                font-weight: 600;
                color: #1f2937;
                line-height: 1.4;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-overflow: ellipsis;
                margin: 0;
            }
            
            .clm-search-title a {
                color: #1f2937;
                text-decoration: none;
            }
            
            .clm-search-title a:hover {
                color: #3b82f6;
            }
            
            .clm-search-meta {
                font-size: 12px;
                color: #6b7280;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            
            .clm-search-meta span {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            
            .clm-search-item.clm-thread-downloaded {
                background: rgba(34, 197, 94, 0.05);
                border: 2px solid rgba(34, 197, 94, 0.2);
            }
            
            /* 手机端适配 */
            @media (max-width: 768px) {
                .clm-search-grid {
                    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                    gap: 12px;
                    padding: 12px;
                }
                
                .clm-search-cover {
                    height: 200px;
                }
                
                .clm-search-cover:hover img {
                    transform: none !important;
                }
                
                .clm-search-cover .clm-cover-gallery-btn {
                    padding: 10px 20px;
                    font-size: 15px;
                    bottom: 35%;
                }
                
                .clm-search-cover .clm-cover-download {
                    padding: 6px 12px;
                    font-size: 13px;
                }
            }
        `);
    }

    // 初始化搜索页面
    function initSearchPage() {
        const href = window.location.href;
        if (href.indexOf('search.php') === -1) {
            console.log('草榴Manager: 非搜索页面，跳过');
            return;
        }

        console.log('草榴Manager: 初始化搜索页面');

        // 注入样式
        injectSearchStyles();

        // 转换搜索结果为卡片布局
        convertSearchToCards();

        // 监听动态加载的内容
        const observer = new MutationObserver(() => {
            convertSearchToCards();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        console.log('草榴Manager: 搜索页面初始化完成');
    }

    // 将搜索结果转换为卡片布局
    function convertSearchToCards() {
        const tableContainer = document.querySelector('div.t');
        if (!tableContainer) return;
        const table = tableContainer.querySelector('table');
        if (!table || table.dataset.clmConverted === '1') return;
        table.dataset.clmConverted = '1';
        
        // 创建卡片网格容器
        const grid = document.createElement('div');
        grid.className = 'clm-search-grid';
        
        // 获取所有搜索结果行
        const rows = table.querySelectorAll('tr.tr3');
        
        rows.forEach((row) => {
            const link = row.querySelector('a[href]');
            if (!link) return;
            
            const threadUrl = CLM.getAbsoluteUrl ? 
                CLM.getAbsoluteUrl(link.getAttribute('href') || link.href) : 
                link.href;
            if (!threadUrl) return;
            
            const threadTitle = link.textContent.trim();
            const qualityTag = CLM.detectQualityTagFromTitle ? 
                CLM.detectQualityTagFromTitle(threadTitle) : null;
            
            // 提取其他信息
            const cells = row.querySelectorAll('td');
            let author = '';
            let replies = '';
            let views = '';
            
            if (cells.length >= 4) {
                author = cells[1]?.textContent.trim() || '';
                replies = cells[2]?.textContent.trim() || '';
                views = cells[3]?.textContent.trim() || '';
            }
            
            // 创建卡片
            const card = document.createElement('div');
            card.className = 'clm-search-item';
            
            // 检查是否已下载
            const threadKey = CLM.normalizeThreadKey ? CLM.normalizeThreadKey(threadUrl) : null;
            if (threadKey && CLM.hasDownloadedThread && CLM.hasDownloadedThread(threadKey)) {
                card.classList.add('clm-thread-downloaded');
            }
            
            // 创建封面容器
            const coverDiv = document.createElement('div');
            coverDiv.className = 'clm-search-cover';
            if (CLM.isMobilePage && CLM.isMobilePage()) {
                coverDiv.classList.add('clm-mobile-search');
            }
            
            // 创建加载提示
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'clm-search-cover-loading';
            loadingDiv.textContent = '加载封面中...';
            coverDiv.appendChild(loadingDiv);
            
            // 创建画廊按钮
            const galleryBtn = document.createElement('button');
            galleryBtn.type = 'button';
            galleryBtn.className = 'clm-cover-gallery-btn';
            galleryBtn.textContent = '画廊';
            galleryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (CLM.openGalleryForThread) {
                    CLM.openGalleryForThread(threadUrl, { instant: true, qualityTag });
                }
            });
            coverDiv.appendChild(galleryBtn);
            
            // 创建下载按钮
            const downloadBtn = document.createElement('button');
            downloadBtn.type = 'button';
            downloadBtn.className = 'clm-cover-download';
            if (CLM.setupThreadDownloadButton) {
                CLM.setupThreadDownloadButton(downloadBtn, {
                    threadUrl,
                    container: card,
                    containerClass: 'clm-thread-downloaded',
                    label: '下載',
                    downloadedLabel: '已下載',
                    threadTitle
                });
            }
            coverDiv.appendChild(downloadBtn);
            
            // 创建品质徽章
            const qualityBadge = document.createElement('div');
            qualityBadge.className = 'clm-quality-badge clm-cover-quality';
            qualityBadge.style.display = 'none';
            if (CLM.updateQualityBadgeElement) {
                CLM.updateQualityBadgeElement(qualityBadge, qualityTag);
            }
            coverDiv.appendChild(qualityBadge);
            
            // 异步加载封面
            loadCoverImage(threadUrl, coverDiv, loadingDiv);
            
            // 创建文本信息区域
            const textDiv = document.createElement('div');
            textDiv.className = 'clm-search-text';
            
            const titleH3 = document.createElement('h3');
            titleH3.className = 'clm-search-title';
            const titleLink = document.createElement('a');
            titleLink.href = threadUrl;
            titleLink.textContent = threadTitle;
            titleH3.appendChild(titleLink);
            textDiv.appendChild(titleH3);
            
            const metaDiv = document.createElement('div');
            metaDiv.className = 'clm-search-meta';
            if (author) {
                const authorSpan = document.createElement('span');
                authorSpan.textContent = `作者: ${author}`;
                metaDiv.appendChild(authorSpan);
            }
            if (replies) {
                const repliesSpan = document.createElement('span');
                repliesSpan.textContent = `回复: ${replies}`;
                metaDiv.appendChild(repliesSpan);
            }
            if (views) {
                const viewsSpan = document.createElement('span');
                viewsSpan.textContent = `查看: ${views}`;
                metaDiv.appendChild(viewsSpan);
            }
            textDiv.appendChild(metaDiv);
            
            card.appendChild(coverDiv);
            card.appendChild(textDiv);
            grid.appendChild(card);
        });
        
        // 将网格插入到表格容器中
        tableContainer.appendChild(grid);
        
        console.log(`草榴Manager: 转换了 ${rows.length} 个搜索结果为卡片`);
    }

    // 异步加载封面图片
    async function loadCoverImage(threadUrl, coverDiv, loadingDiv) {
        try {
            // 这里应该从帖子页面获取封面图片
            // 简化实现：直接显示占位图
            loadingDiv.textContent = '暂无封面';
            
            // TODO: 实现从帖子页面抓取封面的逻辑
            // 可以使用 GM_xmlhttpRequest 获取帖子内容并解析第一张图片
            
        } catch (e) {
            console.warn('草榴Manager: 加载封面失败', e);
            loadingDiv.textContent = '加载失败';
        }
    }

    CLM.initSearchModule = CLM.initSearchModule || initSearchModule;
    CLM.initSearchPage = CLM.initSearchPage || initSearchPage;

    if (window.CLM_PENDING_SEARCH_CTX) {
        try {
            initSearchModule(window.CLM_PENDING_SEARCH_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 search 模块失败', e);
        }
        window.CLM_PENDING_SEARCH_CTX = null;
    }

})(window);
