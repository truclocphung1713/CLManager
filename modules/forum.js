// 板块页面模块
// 处理 thread0806.php 页面的封面预览、画质徽章、画廊按钮、下载按钮等

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

        // 自动初始化板块页面
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => initForumPage());
        } else {
            initForumPage();
        }
    }

    // 注入板块页面 CSS
    function injectForumStyles() {
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
            
            /* 悬停时整个容器放大 - 这样图片和按钮都会一起放大 */
            .wf_item .image-big:hover {
                transform: scale(2);
                z-index: 9999;
            }
            
            /* 图片样式 */
            .wf_item .image-big img {
                display: block;
                border-radius: 4px;
                transition: box-shadow 0.2s ease-in-out, border 0.2s ease-in-out;
            }
            
            /* 悬停时图片添加阴影和边框 */
            .wf_item .image-big:hover img {
                box-shadow: 0 0 12px rgba(0, 0, 0, 0.7);
                border: 2px solid #ffffff;
            }
            
            /* 画廊按钮 - 位于容器内部 */
            .wf_item .clm-cover-gallery-btn {
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
            
            .wf_item .clm-cover-gallery-btn:hover {
                background: rgba(0, 0, 0, 0.95);
            }
            
            /* 下载按钮 - 位于容器内部 */
            .wf_item .clm-cover-download {
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
            
            .wf_item .clm-cover-download.clm-downloaded {
                background: rgba(16, 185, 129, 0.9);
                border-color: rgba(255, 255, 255, 0.55);
            }
            
            .wf_item .clm-cover-download::before {
                content: '⬇';
                font-size: inherit;
            }
            
            .wf_item .clm-cover-download:hover {
                background: rgba(0, 0, 0, 0.9);
            }
            
            /* 清晰度标签 - 位于容器内部 */
            .wf_item .clm-cover-quality {
                position: absolute;
                left: 8px;
                top: 8px;
                z-index: 10;
                max-width: 55px;
                font-size: 9px;
                padding: 2px 5px;
                pointer-events: none;
            }
            .wf_item .clm-text-quality {
                position: relative;
                left: auto;
                bottom: auto;
                display: inline-flex;
                margin-top: 6px;
                transform: none;
            }
            .wf_item.clm-thread-downloaded {
                position: relative;
                box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
                border-radius: 6px;
            }
            .wf_item.clm-thread-downloaded::after {
                content: '已下載';
                position: absolute;
                top: 8px;
                left: 8px;
                background: rgba(34, 197, 94, 0.85);
                color: #fff;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 999px;
                letter-spacing: 0.08em;
                z-index: 2;
            }
        `);
    }

    // 初始化板块页面
    function initForumPage() {
        // 只在桌面端板块页面执行
        if (CLM.isMobilePage && CLM.isMobilePage()) {
            console.log('草榴Manager: 手机端板块页面，跳过桌面端逻辑');
            return;
        }

        const href = window.location.href;
        if (href.indexOf('thread0806.php') === -1) {
            console.log('草榴Manager: 非板块页面，跳过');
            return;
        }

        console.log('草榴Manager: 初始化桌面端板块页面');

        // 注入样式
        injectForumStyles();

        const COVER_SCALE = 2;
        let currentListHoverCtx = null;

        function setCurrentListHover(ctx) {
            if (currentListHoverCtx && currentListHoverCtx.cover) {
                currentListHoverCtx.cover.classList.remove('clm-gallery-focus-cover');
            }
            currentListHoverCtx = ctx;
            if (ctx && ctx.cover) {
                ctx.cover.classList.add('clm-gallery-focus-cover');
            }
        }

        function attachCoverDownloadButtons() {
            const covers = document.querySelectorAll('.wf_item .image-big');
            covers.forEach(cover => {
                if (cover.dataset.clmCoverBtnAttached === '1') return;
                cover.dataset.clmCoverBtnAttached = '1';
                const wfItem = cover.closest('.wf_item');

                // 创建画廊按钮
                const galleryBtn = document.createElement('button');
                galleryBtn.type = 'button';
                galleryBtn.className = 'clm-cover-gallery-btn';
                galleryBtn.textContent = '画廊';
                cover.appendChild(galleryBtn);

                // 创建下载按钮
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'clm-cover-download';
                cover.appendChild(btn);

                // 创建品质徽章
                const qualityBadge = document.createElement('div');
                qualityBadge.className = 'clm-quality-badge clm-cover-quality';
                qualityBadge.style.display = 'none';
                cover.appendChild(qualityBadge);

                const img = cover.querySelector('img');

                // 鼠标悬停时设置CSS变量，让按钮和品质标识随封面放大
                cover.addEventListener('mouseenter', () => {
                    cover.style.setProperty('--clm-cover-scale', COVER_SCALE);
                });
                cover.addEventListener('mouseleave', () => {
                    cover.style.setProperty('--clm-cover-scale', '1');
                });

                let threadUrl = null;
                const threadAnchor = cover.querySelector('a[href]') ||
                    wfItem?.querySelector('a[href]');
                if (threadAnchor) {
                    const rawHref = threadAnchor.getAttribute('href') || threadAnchor.href;
                    threadUrl = CLM.getAbsoluteUrl ? CLM.getAbsoluteUrl(rawHref) : rawHref;
                    if (threadUrl && CLM.bindGalleryVisitedIndicator) {
                        CLM.bindGalleryVisitedIndicator(cover, threadUrl, 'cover');
                    }
                    if (threadUrl) {
                        cover.addEventListener('mouseenter', () => {
                            const hoverQuality = ensureCoverQuality();
                            setCurrentListHover({
                                source: 'board',
                                threadUrl,
                                cover,
                                qualityTag: hoverQuality
                            });
                        });
                        cover.addEventListener('mouseleave', () => {
                            if (currentListHoverCtx?.cover === cover) {
                                setCurrentListHover(null);
                            }
                        });
                    }
                }

                const resolveCoverQuality = () => {
                    if (CLM.resolveQualityTagFromListItem) {
                        return CLM.resolveQualityTagFromListItem(wfItem, threadAnchor);
                    }
                    return null;
                };
                let cachedCoverQuality = null;
                const ensureCoverQuality = () => {
                    cachedCoverQuality = resolveCoverQuality();
                    if (CLM.updateQualityBadgeElement) {
                        CLM.updateQualityBadgeElement(qualityBadge, cachedCoverQuality);
                    }
                    return cachedCoverQuality;
                };
                ensureCoverQuality();

                // 画廊按钮点击事件
                if (threadUrl) {
                    galleryBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const qualityTag = ensureCoverQuality();
                        if (CLM.openGalleryForThread) {
                            CLM.openGalleryForThread(threadUrl, { instant: true, qualityTag });
                        }
                    });
                }

                if (CLM.setupThreadDownloadButton) {
                    CLM.setupThreadDownloadButton(btn, {
                        threadUrl,
                        container: wfItem,
                        containerClass: 'clm-thread-downloaded',
                        label: '下載',
                        downloadedLabel: '已下載',
                        threadTitle: (threadAnchor?.textContent || '').trim()
                    });
                }
            });
        }

        function attachTextOnlyQualityBadges() {
            const items = document.querySelectorAll('.wf_item');
            items.forEach(item => {
                if (item.querySelector('.image-big')) {
                    return;
                }
                const threadAnchor = item.querySelector('a[href]');
                const qualityTag = CLM.resolveQualityTagFromListItem ? 
                    CLM.resolveQualityTagFromListItem(item, threadAnchor) : null;
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
                if (CLM.updateQualityBadgeElement) {
                    CLM.updateQualityBadgeElement(badge, qualityTag);
                }
            });
        }

        attachCoverDownloadButtons();
        attachTextOnlyQualityBadges();

        const coverObserver = new MutationObserver(() => {
            attachCoverDownloadButtons();
            attachTextOnlyQualityBadges();
        });
        coverObserver.observe(document.body, { childList: true, subtree: true });

        console.log('草榴Manager: 桌面端板块页面初始化完成');
    }

    CLM.initForumModule = CLM.initForumModule || initForumModule;
    CLM.initForumPage = CLM.initForumPage || initForumPage;

    if (window.CLM_PENDING_FORUM_CTX) {
        try {
            initForumModule(window.CLM_PENDING_FORUM_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 forum 模块失败', e);
        }
        window.CLM_PENDING_FORUM_CTX = null;
    }

})(window);
