// 桌面端模块：整合 forum、search、gallery、download、settings 功能
// 处理桌面端页面的所有 UI 增强功能

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    let desktopCtx = null;

    // ========================================
    // 初始化桌面端模块
    // ========================================
    
    function initDesktopModule(ctx) {
        if (!ctx) {
            console.warn('草榴Manager: desktop 模块初始化参数不完整', ctx);
            return;
        }

        desktopCtx = ctx;
        CLM._desktopModuleLoaded = true;
        console.log('草榴Manager: desktop 模块已加载');

        // 检测页面类型并初始化相应功能
        const pageType = detectCurrentPageType();
        console.log('草榴Manager: 桌面端页面类型 =', pageType);

        // 注入通用样式
        injectDesktopStyles();

        // 根据页面类型初始化
        if (pageType === 'desktop-forum') {
            initForumPage();
        } else if (pageType === 'desktop-search') {
            initSearchPage();
        } else if (pageType === 'desktop-thread') {
            initThreadPage();
        }
    }

    // ========================================
    // 页面类型检测
    // ========================================
    
    function detectCurrentPageType() {
        const href = window.location.href;
        const isMobile = CLM.isMobilePage ? CLM.isMobilePage() : false;
        
        if (isMobile) return 'mobile';
        
        if (href.indexOf('/htm_mob/') !== -1 || href.indexOf('/htm_data/') !== -1) {
            return 'desktop-thread';
        }
        if (href.indexOf('search.php') !== -1) {
            return 'desktop-search';
        }
        if (href.indexOf('thread0806.php') !== -1) {
            return 'desktop-forum';
        }
        return 'unknown';
    }

    // ========================================
    // 通用样式注入
    // ========================================
    
    function injectDesktopStyles() {
        if (!CLM.injectStyle) {
            console.warn('草榴Manager: injectStyle 函数不可用');
            return;
        }

        CLM.injectStyle(`
            /* 封面容器 - 允许内容溢出，创建独立层叠上下文 */
            .wf_item .image-big {
                position: relative;
                overflow: visible !important;
                isolation: isolate;
                transition: transform 0.2s ease-in-out;
                transform-origin: center center;
            }
            
            /* 悬停时整个容器放大 */
            .wf_item .image-big:hover {
                transform: scale(2);
                z-index: 9999;
            }

            /* 画廊按钮样式 */
            .clm-gallery-btn {
                position: absolute;
                bottom: 8px;
                right: 8px;
                background: rgba(59, 130, 246, 0.9);
                color: #fff;
                border: none;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                z-index: 10;
                transition: all 0.2s ease;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }
            
            .clm-gallery-btn:hover {
                background: rgba(37, 99, 235, 1);
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            }

            /* 下载按钮样式 */
            .clm-download-btn {
                position: absolute;
                top: 8px;
                right: 8px;
                background: rgba(34, 197, 94, 0.9);
                color: #fff;
                border: none;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                z-index: 10;
                transition: all 0.2s ease;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }
            
            .clm-download-btn:hover {
                background: rgba(22, 163, 74, 1);
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            }

            .clm-download-btn.clm-downloaded {
                background: rgba(107, 114, 128, 0.9);
            }

            /* 搜索页面标题链接样式 */
            .search-result-title {
                cursor: pointer;
                transition: color 0.2s ease;
            }

            .search-result-title:hover {
                color: #3b82f6;
            }
        `);
    }

    // ========================================
    // 论坛/板块页面功能
    // ========================================
    
    function initForumPage() {
        console.log('草榴Manager: 初始化论坛板块页面');
        
        // 手机端板块页面，跳过桌面端逻辑
        if (CLM.isMobilePage && CLM.isMobilePage()) {
            console.log('草榴Manager: 手机端板块页面，跳过桌面端逻辑');
            return;
        }

        // 初次附着封面按钮和清晰度徽章
        attachDesktopCoverButtons();
        attachDesktopTextOnlyQualityBadges();

        // 监听 DOM 变化，处理后续加载的帖子项
        const observer = new MutationObserver(() => {
            try {
                attachDesktopCoverButtons();
                attachDesktopTextOnlyQualityBadges();
            } catch (e) {
                console.warn('草榴Manager: 更新桌面端封面按钮时出错', e);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function enhanceForumItem(item) {
        // 查找封面和标题
        const coverContainer = item.querySelector('.image-big');
        const titleLink = item.querySelector('.wf_text a[href*="htm_data"], .wf_text a[href*="htm_mob"]');
        
        if (!coverContainer || !titleLink) return;

        const rawHref = titleLink.getAttribute('href') || titleLink.href;
        const threadUrl = (CLM.getAbsoluteUrl ? CLM.getAbsoluteUrl(rawHref) : rawHref) || rawHref;
        if (!threadUrl) return;

        // 清晰度徽章（封面左上角）
        let qualityBadge = coverContainer.querySelector('.clm-quality-badge.clm-cover-quality');
        if (!qualityBadge) {
            qualityBadge = document.createElement('div');
            qualityBadge.className = 'clm-quality-badge clm-cover-quality';
            coverContainer.appendChild(qualityBadge);
        }
        if (CLM.resolveQualityTagFromListItem && CLM.updateQualityBadgeElement) {
            try {
                const qualityTag = CLM.resolveQualityTagFromListItem(item, titleLink);
                CLM.updateQualityBadgeElement(qualityBadge, qualityTag);
            } catch (e) {
                console.warn('草榴Manager: 更新桌面端清晰度徽章失败', e);
            }
        }

        // 访问标记（根据画廊访问记录改变样式）
        if (CLM.bindGalleryVisitedIndicator) {
            try {
                CLM.bindGalleryVisitedIndicator(coverContainer, threadUrl, 'cover');
            } catch (e) {
                console.warn('草榴Manager: 绑定桌面端访问标记失败', e);
            }
        }

        // 添加画廊按钮
        if (!coverContainer.querySelector('.clm-gallery-btn')) {
            const galleryBtn = document.createElement('button');
            galleryBtn.className = 'clm-gallery-btn';
            galleryBtn.textContent = '画廊';
            galleryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (CLM.openGalleryForThread) {
                    // 将封面检测到的清晰度传入画廊，保持与旧版行为一致
                    let qualityTag = null;
                    if (CLM.resolveQualityTagFromListItem) {
                        try {
                            qualityTag = CLM.resolveQualityTagFromListItem(item, titleLink);
                        } catch (err) {
                            console.warn('草榴Manager: 解析清晰度失败', err);
                        }
                    }
                    CLM.openGalleryForThread(threadUrl, { instant: true, qualityTag });
                }
            });
            coverContainer.appendChild(galleryBtn);
        }

        // 添加下载按钮
        if (!coverContainer.querySelector('.clm-download-btn')) {
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'clm-download-btn';
            downloadBtn.textContent = '下载';
            
            // 使用 setupThreadDownloadButton 如果可用
            if (CLM.setupThreadDownloadButton) {
                CLM.setupThreadDownloadButton(downloadBtn, {
                    threadUrl: threadUrl,
                    container: item,
                    containerClass: 'clm-thread-downloaded',
                    threadTitle: titleLink.textContent.trim(),
                    label: '下载',
                    downloadedLabel: '已下载'
                });
            } else {
                downloadBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (CLM.handleThreadDownloadButtonClick) {
                        CLM.handleThreadDownloadButtonClick(downloadBtn);
                    }
                });
            }
            
            coverContainer.appendChild(downloadBtn);
        }

        // 添加悬停预览功能
        coverContainer.addEventListener('mouseenter', () => {
            if (CLM.setCurrentListHoverCtx) {
                // 把清晰度也塞进悬停上下文，便于画廊入口使用
                let qualityTag = null;
                if (CLM.resolveQualityTagFromListItem) {
                    try {
                        qualityTag = CLM.resolveQualityTagFromListItem(item, titleLink);
                    } catch (err) {
                        console.warn('草榴Manager: 解析清晰度失败', err);
                    }
                }
                CLM.setCurrentListHoverCtx({
                    source: 'board',
                    threadUrl: threadUrl,
                    cover: coverContainer,
                    qualityTag
                });
            }
        });

        coverContainer.addEventListener('mouseleave', () => {
            if (CLM.setCurrentListHoverCtx) {
                CLM.setCurrentListHoverCtx(null);
            }
        });
    }

    // 参照旧版 attachCoverDownloadButtons：按封面元素维度附着按钮，避免重复处理
    function attachDesktopCoverButtons() {
        const covers = document.querySelectorAll('.wf_item .image-big');
        covers.forEach((cover) => {
            if (cover.dataset.clmDesktopCoverAttached === '1') return;
            cover.dataset.clmDesktopCoverAttached = '1';
            const wfItem = cover.closest('.wf_item');
            if (!wfItem) return;
            try {
                enhanceForumItem(wfItem);
            } catch (e) {
                console.warn('草榴Manager: 处理桌面端封面项失败', e);
            }
        });
    }

    // 参照旧版 attachTextOnlyQualityBadges：无封面的帖子仅显示文字清晰度徽章
    function attachDesktopTextOnlyQualityBadges() {
        if (!CLM.resolveQualityTagFromListItem || !CLM.updateQualityBadgeElement) {
            return;
        }
        const items = document.querySelectorAll('.wf_item');
        items.forEach((item) => {
            if (item.querySelector('.image-big')) {
                return;
            }
            const threadAnchor = item.querySelector('a[href]');
            const qualityTag = CLM.resolveQualityTagFromListItem(item, threadAnchor);
            let badge = item.querySelector('.clm-text-quality');
            if (!qualityTag) {
                if (badge) {
                    badge.remove();
                }
                return;
            }
            const textContainer = item.querySelector('.wf_text');
            if (!textContainer) {
                return;
            }
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'clm-quality-badge clm-text-quality';
                textContainer.appendChild(badge);
            }
            CLM.updateQualityBadgeElement(badge, qualityTag);
        });
    }

    // ========================================
    // 搜索页面功能
    // ========================================
    
    function initSearchPage() {
        console.log('草榴Manager: 初始化搜索页面');

        // 处理搜索结果
        const results = document.querySelectorAll('tr[id^="normalthread_"]');
        console.log(`草榴Manager: 找到 ${results.length} 个搜索结果`);

        results.forEach((result, index) => {
            try {
                enhanceSearchResult(result);
            } catch (e) {
                console.warn(`草榴Manager: 处理搜索结果 ${index} 失败`, e);
            }
        });
    }

    function enhanceSearchResult(result) {
        const titleLink = result.querySelector('a[href*="htm_data"], a[href*="htm_mob"]');
        if (!titleLink) return;

        const threadUrl = titleLink.href;
        if (!threadUrl) return;

        // 添加点击事件打开画廊
        titleLink.style.cursor = 'pointer';
        titleLink.addEventListener('click', (e) => {
            // 如果按住 Ctrl 或 Cmd 键，允许默认行为（新标签页打开）
            if (e.ctrlKey || e.metaKey) return;
            
            e.preventDefault();
            if (CLM.openGalleryForThread) {
                CLM.openGalleryForThread(threadUrl, { instant: true });
            }
        });

        // 添加悬停效果
        titleLink.addEventListener('mouseenter', () => {
            if (CLM.setCurrentListHoverCtx) {
                CLM.setCurrentListHoverCtx({
                    source: 'search',
                    threadUrl: threadUrl,
                    titleEl: titleLink,
                    qualityTag: null
                });
            }
        });

        titleLink.addEventListener('mouseleave', () => {
            if (CLM.setCurrentListHoverCtx) {
                CLM.setCurrentListHoverCtx(null);
            }
        });
    }

    // ========================================
    // 帖子详情页功能
    // ========================================
    
    function initThreadPage() {
        console.log('草榴Manager: 初始化帖子详情页');
        
        // 帖子详情页的增强功能
        // 例如：自动展开图片、添加下载按钮等
        
        // 查找下载链接
        const downloadLink = document.querySelector('#rmlink[href], a[href*="rmdown.com/link.php"]');
        if (downloadLink) {
            console.log('草榴Manager: 找到下载链接', downloadLink.href);
            
            // 可以在这里添加一键下载按钮
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = '一键下载';
            downloadBtn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                background: #22c55e;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 12px 24px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            `;
            
            downloadBtn.addEventListener('click', () => {
                window.open(downloadLink.href, '_blank');
            });
            
            document.body.appendChild(downloadBtn);
        }
    }

    // ========================================
    // 暴露初始化函数
    // ========================================
    
    CLM.initDesktopModule = CLM.initDesktopModule || initDesktopModule;

    // 如果有待处理的上下文，立即初始化
    if (window.CLM_PENDING_DESKTOP_CTX) {
        try {
            initDesktopModule(window.CLM_PENDING_DESKTOP_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 desktop 模块失败', e);
        }
        delete window.CLM_PENDING_DESKTOP_CTX;
    }

})(window);
