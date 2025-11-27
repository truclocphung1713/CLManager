// 手机端相关模块示例
// 将来可以把 isMobilePage / 手机画廊适配 / 手势逻辑等拆到这里，
// 并在模块加载后按页面类型自行初始化。

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    function injectStyle(css) {
        const doc = window.document;
        if (!doc) return;
        const head = doc.head || doc.getElementsByTagName('head')[0];
        if (!head) return;
        const style = doc.createElement('style');
        style.type = 'text/css';
        style.textContent = css;
        head.appendChild(style);
    }

    function registerMobileGalleryGestures(ctx) {
        if (!ctx || !ctx.viewer || !ctx.overlay) return;

        const viewer = ctx.viewer;
        const overlay = ctx.overlay;
        const topicPanel = ctx.topicPanel;
        const toggleTopicPanelState = ctx.toggleTopicPanelState;
        const showNext = ctx.showNext;
        const showPrev = ctx.showPrev;
        const showTapIndicator = ctx.showTapIndicator;

        if (viewer._clmMobileGesturesAttached) {
            return;
        }
        viewer._clmMobileGesturesAttached = true;

        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;
        let initialPinchDistance = 0;
        let isZooming = false;

        viewer.addEventListener('touchstart', (e) => {
            if (!overlay.classList.contains('clm-active')) return;
            if (!document.body.classList.contains('clm-mobile-gallery')) return;

            const target = e.target;
            if (target.closest('.clm-gallery-panel-comments') ||
                target.closest('.clm-mobile-comment-btn') ||
                target.closest('.clm-gallery-close') ||
                target.closest('.clm-gallery-panel-topic') ||
                target.closest('.clm-gallery-ads-slot-viewer-top')) {
                return;
            }

            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
                isZooming = true;
                console.log('草榴Manager: 检测到双指触摸，初始距离:', initialPinchDistance);
            } else if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isZooming = false;
                console.log('草榴Manager: 触摸开始', touchStartX, touchStartY);
            }
        }, { passive: true });

        viewer.addEventListener('touchmove', (e) => {
            if (!overlay.classList.contains('clm-active')) return;
            if (!document.body.classList.contains('clm-mobile-gallery')) return;

            if (e.touches.length === 2 && initialPinchDistance > 0) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const currentDistance = Math.sqrt(dx * dx + dy * dy);

                if (Math.abs(currentDistance - initialPinchDistance) > 10) {
                    isZooming = true;
                    const scale = currentDistance / initialPinchDistance;
                    console.log('草榴Manager: 双指缩放比例:', scale);
                }
            }
        }, { passive: true });

        viewer.addEventListener('touchend', (e) => {
            if (!overlay.classList.contains('clm-active')) return;
            if (!document.body.classList.contains('clm-mobile-gallery')) return;

            const target = e.target;
            if (target.closest('.clm-gallery-panel-comments') ||
                target.closest('.clm-mobile-comment-btn') ||
                target.closest('.clm-gallery-close') ||
                target.closest('.clm-gallery-panel-topic') ||
                target.closest('.clm-gallery-ads-slot-viewer-top')) {
                return;
            }

            if (e.touches.length === 0 && !isZooming && e.changedTouches && e.changedTouches[0]) {
                touchEndX = e.changedTouches[0].clientX;
                touchEndY = e.changedTouches[0].clientY;
                console.log('草榴Manager: 触摸结束', touchEndX, touchEndY);
                handleGesture();
            }

            if (e.touches.length === 0) {
                isZooming = false;
                initialPinchDistance = 0;
            }
        }, { passive: true });

        function handleGesture() {
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            const absDeltaX = Math.abs(deltaX);
            const absDeltaY = Math.abs(deltaY);
            const minSwipeDistance = 80;
            const minVerticalSwipeDistance = 60;

            console.log('草榴Manager: 手势检测 deltaX:', deltaX, 'deltaY:', deltaY);

            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 0;
            const isTopicExpanded = topicPanel && topicPanel.classList.contains('clm-topic-expanded');

            if (!isZooming && absDeltaY > absDeltaX && absDeltaY > minVerticalSwipeDistance && viewportHeight > 0) {
                const startY = touchStartY;
                const bottomThreshold = viewportHeight * 0.5;
                if (startY > bottomThreshold && typeof toggleTopicPanelState === 'function') {
                    if (!isTopicExpanded && deltaY < 0) {
                        console.log('草榴Manager: 上滑，展开主题抽屉');
                        toggleTopicPanelState();
                    } else if (isTopicExpanded && deltaY > 0) {
                        console.log('草榴Manager: 下滑，收起主题抽屉');
                        toggleTopicPanelState();
                    }
                }
                return;
            }

            if (!isZooming && absDeltaX > absDeltaY && absDeltaX > minSwipeDistance) {
                if (deltaX > 0) {
                    console.log('草榴Manager: 向右滑动，显示下一张');
                    if (typeof showNext === 'function') {
                        showNext();
                    }
                    if (typeof showTapIndicator === 'function') {
                        showTapIndicator('right');
                    }
                } else {
                    console.log('草榴Manager: 向左滑动，显示上一张');
                    if (typeof showPrev === 'function') {
                        showPrev();
                    }
                    if (typeof showTapIndicator === 'function') {
                        showTapIndicator('left');
                    }
                }
            }
        }
    }

    function registerMobileComments(ctx) {
        if (!ctx || !ctx.overlay || !ctx.commentsPanel || !ctx.mobileCommentBtn) return;

        const overlay = ctx.overlay;
        const commentsPanel = ctx.commentsPanel;
        const mobileCommentBtn = ctx.mobileCommentBtn;
        const mobileCommentCloseBtn = ctx.mobileCommentCloseBtn || null;

        if (commentsPanel._clmMobileCommentsAttached) {
            return;
        }
        commentsPanel._clmMobileCommentsAttached = true;

        let commentsExpanded = false;
        const closeComments = () => {
            commentsExpanded = false;
            commentsPanel.classList.remove('clm-comments-expanded');
        };
        const openComments = () => {
            commentsExpanded = true;
            commentsPanel.classList.add('clm-comments-expanded');
        };

        mobileCommentBtn.addEventListener('click', (e) => {
            // 避免点击事件冒泡到图片 viewer，导致误触翻页
            e.stopPropagation();
            if (commentsExpanded) {
                closeComments();
            } else {
                openComments();
            }
        });

        if (mobileCommentCloseBtn) {
            mobileCommentCloseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeComments();
            });
        }

        // 手机端：点击评论面板外区域关闭评论内容
        overlay.addEventListener('click', (e) => {
            if (!commentsExpanded) return;
            const target = e.target;
            // 点击在评论面板内部或评论按钮本身时不关闭
            if (target.closest('.clm-gallery-panel-comments') || target.closest('.clm-mobile-comment-btn')) {
                return;
            }
            closeComments();
            // 避免事件继续冒泡到 viewer 引发翻页
            e.stopPropagation();
        });
    }

    function initMobileForumEnhancements(ctx) {
        if (!ctx) return;

        const getAbsoluteUrl = ctx.getAbsoluteUrl;
        const resolveQualityTagFromListItem = ctx.resolveQualityTagFromListItem;
        const updateQualityBadgeElement = ctx.updateQualityBadgeElement;
        const bindGalleryVisitedIndicator = ctx.bindGalleryVisitedIndicator;
        const openGalleryForThread = ctx.openGalleryForThread;
        const setupThreadDownloadButton = ctx.setupThreadDownloadButton;

        const doc = window.document;
        if (!doc || !doc.body) return;
        if (doc.body.dataset.clmMobileForumInitialized === '1') return;
        doc.body.dataset.clmMobileForumInitialized = '1';

        injectStyle(`
                .wf_item .image-big {
                    overflow: hidden !important;
                    position: relative;
                }
                .wf_item .image-big img {
                    transition: none !important;
                    transform: none !important;
                }
                .wf_item .image-big:hover img {
                    transform: none !important;
                }
                .wf_item .clm-cover-gallery-btn {
                    position: absolute;
                    left: 50%;
                    bottom: 35%;
                    transform: translateX(-50%);
                    padding: 10px 20px;
                    font-size: 15px;
                    font-weight: 600;
                    border-radius: 8px;
                    border: 1px solid rgba(255, 255, 255, 0.6);
                    background: rgba(0, 0, 0, 0.85);
                    color: #fff;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    z-index: 10000;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
                }
                .wf_item .clm-cover-gallery-btn:active {
                    background: rgba(0, 0, 0, 0.95);
                    transform: translateX(-50%) scale(0.95);
                }
                .wf_item .clm-cover-download {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    padding: 6px 12px;
                    font-size: 13px;
                    border-radius: 6px;
                    border: 1px solid rgba(255, 255, 255, 0.4);
                    background: rgba(0, 0, 0, 0.75);
                    color: #fff;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    z-index: 2;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                }
                .wf_item .clm-cover-download:active {
                    background: rgba(0, 0, 0, 0.9);
                    transform: scale(0.95);
                }
                .wf_item .clm-cover-download.clm-downloaded {
                    background: rgba(16, 185, 129, 0.9);
                    border-color: rgba(255, 255, 255, 0.55);
                }
                .wf_item .clm-cover-download::before {
                    content: '\u2b07';
                    font-size: 13px;
                }
                .wf_item .clm-cover-quality {
                    position: absolute;
                    left: 8px;
                    top: 8px;
                    z-index: 10000;
                    max-width: 50px;
                    font-size: 9px;
                    padding: 2px 5px;
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
                    content: '\u5df2\u4e0b\u8f7d';
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

        function attachMobileCoverButtons() {
            const covers = doc.querySelectorAll('.wf_item .image-big');
            covers.forEach((cover) => {
                if (cover.dataset.clmMobileBtnAttached === '1') return;
                cover.dataset.clmMobileBtnAttached = '1';
                const wfItem = cover.closest('.wf_item');

                const galleryBtn = doc.createElement('button');
                galleryBtn.type = 'button';
                galleryBtn.className = 'clm-cover-gallery-btn';
                galleryBtn.textContent = '\u753b\u5eca';
                cover.appendChild(galleryBtn);

                const downloadBtn = doc.createElement('button');
                downloadBtn.type = 'button';
                downloadBtn.className = 'clm-cover-download';
                downloadBtn.textContent = '\u4e0b\u8f7d';
                cover.appendChild(downloadBtn);

                const qualityBadge = doc.createElement('div');
                qualityBadge.className = 'clm-quality-badge clm-cover-quality';
                cover.appendChild(qualityBadge);

                const threadAnchor = wfItem ? wfItem.querySelector('a[href]') : null;
                const rawHref = threadAnchor ? (threadAnchor.getAttribute('href') || threadAnchor.href) : null;
                const threadUrl = rawHref && typeof getAbsoluteUrl === 'function' ? getAbsoluteUrl(rawHref) : null;
                const qualityTag = typeof resolveQualityTagFromListItem === 'function' ? resolveQualityTagFromListItem(wfItem, threadAnchor) : null;
                if (typeof updateQualityBadgeElement === 'function') {
                    updateQualityBadgeElement(qualityBadge, qualityTag);
                }

                if (threadUrl) {
                    cover.dataset.clmThreadKey = threadUrl;
                    if (typeof bindGalleryVisitedIndicator === 'function') {
                        bindGalleryVisitedIndicator(cover, threadUrl, 'cover');
                    }

                    galleryBtn.addEventListener('click', (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (typeof openGalleryForThread === 'function') {
                            openGalleryForThread(threadUrl, { instant: true, qualityTag });
                        }
                    });

                    const threadTitle = (threadAnchor && threadAnchor.textContent ? threadAnchor.textContent : '').trim();
                    if (typeof setupThreadDownloadButton === 'function') {
                        setupThreadDownloadButton(downloadBtn, {
                            threadUrl,
                            container: wfItem,
                            containerClass: 'clm-thread-downloaded',
                            label: '\u4e0b\u8f7d',
                            downloadedLabel: '\u5df2\u4e0b\u8f7d',
                            threadTitle
                        });
                    }
                }
            });
        }

        function attachMobileTextOnlyQualityBadges() {
            const items = doc.querySelectorAll('.wf_item');
            items.forEach((item) => {
                if (item.querySelector('.image-big')) {
                    return;
                }
                const threadAnchor = item.querySelector('a[href]');
                const qualityTag = typeof resolveQualityTagFromListItem === 'function' ? resolveQualityTagFromListItem(item, threadAnchor) : null;
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
                    badge = doc.createElement('div');
                    badge.className = 'clm-quality-badge clm-text-quality';
                    textContainer.appendChild(badge);
                }
                if (typeof updateQualityBadgeElement === 'function') {
                    updateQualityBadgeElement(badge, qualityTag);
                }
            });
        }

        attachMobileCoverButtons();
        attachMobileTextOnlyQualityBadges();

        const mobileObserver = new MutationObserver(() => {
            attachMobileCoverButtons();
            attachMobileTextOnlyQualityBadges();
        });
        mobileObserver.observe(doc.body, { childList: true, subtree: true });
    }

    function initMobileEnhancements() {
        // 手机端画廊模式适配 - 抖音短视频风格
        injectStyle(`
            /* 手机端画廊模式 - 抖音风格布局 - 覆盖所有桌面端样式 */
            body.clm-mobile-gallery .clm-gallery-overlay {
                padding: 0 !important;
                background: #000 !important;
                transform: none !important;
                align-items: stretch !important;
                justify-content: stretch !important;
            }
            body.clm-mobile-gallery .clm-gallery-layout {
                display: flex !important;
                flex-direction: column !important;
                gap: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                max-width: 100vw !important;
                max-height: 100vh !important;
                position: relative !important;
                grid-template-columns: none !important;
            }
            
            /* 隐藏所有桌面端元素（手机端下保留 actions 作为下载按钮区域） */
            body.clm-mobile-gallery .clm-gallery-panel-topic,
            body.clm-mobile-gallery .clm-gallery-panel-comments {
                display: none !important;
            }
            body.clm-mobile-gallery .clm-gallery-arrow,
            body.clm-mobile-gallery .clm-gallery-meta,
            body.clm-mobile-gallery .clm-gallery-hint,
            /* 隐藏底部的viewer广告区域 */
            .clm-gallery-ads-slot-viewer-bottom {
                display: none !important;
            }
            
            /* 顶部广告区域 - ftad-ct（手机端：带浅色背景条，类似 footer 效果） */
            body.clm-mobile-gallery .clm-gallery-ads-slot-viewer-top {
                position: fixed !important;
                top: 50px !important;
                left: 0 !important;
                right: 0 !important;
                width: 100% !important;
                max-width: 100vw !important;
                background: #f9f9ec !important;
                z-index: 100001 !important;
                padding: 6px 8px !important;
                max-height: 110px !important;
                overflow-y: hidden !important;
                box-sizing: border-box !important;
            }
            
            /* 修复手机端帖子内广告样式 */
            body.clm-mobile-gallery .clm-panel-entry-tips {
                width: 100% !important;
                margin-top: 10px !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips .sptable_do_not_remove {
                width: 100% !important;
                background: rgba(255, 255, 255, 0.05) !important;
                border-radius: 8px !important;
                overflow: hidden !important;
                margin-bottom: 8px !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips .f_one {
                padding: 10px !important;
                background: rgba(255, 255, 255, 0.08) !important;
                border-radius: 8px !important;
                margin-bottom: 8px !important;
                cursor: pointer !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips .f_one:active {
                background: rgba(255, 255, 255, 0.12) !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-ads table.sptable_do_not_remove {
                width: 100% !important;
                background: rgba(255, 255, 255, 0.05) !important;
                border-radius: 8px !important;
                overflow: hidden !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips table.sptable_do_not_remove td,
            body.clm-mobile-gallery .clm-gallery-ads table.sptable_do_not_remove td {
                padding: 10px !important;
                font-size: 13px !important;
                line-height: 1.4 !important;
                color: #fff !important;
                background: transparent !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips #ti,
            body.clm-mobile-gallery .clm-gallery-ads table.sptable_do_not_remove #ti {
                font-weight: 600 !important;
                margin-bottom: 4px !important;
                font-size: 14px !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips #ti a,
            body.clm-mobile-gallery .clm-gallery-ads table.sptable_do_not_remove #ti a {
                color: #fff !important;
                text-decoration: none !important;
            }
            
            body.clm-mobile-gallery .clm-panel-entry-tips a,
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry-tips a,
            body.clm-mobile-gallery .clm-gallery-ads table.sptable_do_not_remove a {
                color: #9db4ff !important;
                text-decoration: none !important;
            }
            
            /* 不再在手机端展示 sptable_info AD 小标签（DOM 层已不创建） */
            
            /* 关闭按钮移到顶部右上角 */
            body.clm-mobile-gallery .clm-gallery-close {
                position: fixed !important;
                top: 8px !important;
                right: 8px !important;
                z-index: 100004 !important;
                width: 40px !important;
                height: 40px !important;
                background: rgba(0, 0, 0, 0.7) !important;
                border-radius: 50% !important;
                font-size: 22px !important;
                border: none !important;
                color: #fff !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                touch-action: manipulation !important;
                -webkit-tap-highlight-color: transparent !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-close:active {
                transform: scale(0.9) !important;
                background: rgba(0, 0, 0, 0.9) !important;
            }
            
            /* 中央图片查看器 - 屏幕正中央 */
            body.clm-mobile-gallery .clm-gallery-viewer-column {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 1 !important;
                gap: 0 !important;
                min-height: 100vh !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-viewer {
                width: 100% !important;
                height: 100% !important;
                max-width: 100vw !important;
                max-height: 100vh !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                position: relative !important;
                flex: 1 !important;
                background: transparent !important;
                border-radius: 0 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-viewer img {
                max-width: 100vw !important;
                max-height: 100vh !important;
                width: auto !important;
                height: auto !important;
                object-fit: contain !important;
                touch-action: pan-x pan-y pinch-zoom !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                cursor: default !important;
            }
            
            /* 隐藏加载指示器和其他viewer内元素，只保留图片 */
            body.clm-mobile-gallery .clm-gallery-loading-indicator {
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                z-index: 100002 !important;
                color: #fff !important;
                font-size: 16px !important;
            }
            
            /* 主题内容底部抽屉（Bottom Sheet） - 黑色毛玻璃渐变背景 */
            body.clm-mobile-gallery .clm-gallery-panel-topic {
                display: block !important;
                position: fixed !important;
                left: 0 !important;
                bottom: 0 !important;
                width: 100% !important;
                max-width: 100vw !important;
                background: linear-gradient(to top, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.6)) !important;
                backdrop-filter: blur(16px) !important;
                -webkit-backdrop-filter: blur(16px) !important;
                border-radius: 0 !important;
                padding: 0 30px 24px !important;
                z-index: 100002 !important;
                overflow: visible !important;
                color: #f9fafb !important;
                box-shadow: 0 -5px 30px rgba(0, 0, 0, 0.5) !important;
                border: none !important;
                flex-direction: column !important;
                cursor: pointer !important;
            }
            
            /* 折叠状态下：高度约占屏幕底部四分之一，便于点击 */
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-collapsed {
                min-height: 25vh !important;
                max-height: 25vh !important;
            }

            /* 顶部中间的箭头图标（与手机端画廊.html 的 arrow-large 风格一致） */
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-collapsed::after,
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-expanded::after {
                content: '' !important;
                position: absolute !important;
                top: 0 !important;
                left: 50% !important;
                width: 24px !important;
                height: 24px !important;
                border-radius: 0 !important;
                border-right: 4px solid #333 !important;
                border-bottom: 4px solid #333 !important;
                transform: translate(-50%, -50%) rotate(225deg) !important;
                background: transparent !important;
                box-shadow: none !important;
                pointer-events: none !important;
                opacity: 0.7 !important;
            }

            /* 展开状态：箭头向上（整体图标旋转） */
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-expanded::after {
                transform: translate(-50%, -50%) rotate(45deg) !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-header {
                display: none !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body {
                font-size: 14px !important;
                line-height: 1.5 !important;
                color: #f9fafb !important;
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9) !important;
                overflow-y: auto !important;
                max-height: 100% !important;
                padding: 24px 0 24px !important;
                background: transparent !important;
                border-radius: 0 !important;
                border: none !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                position: relative !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-collapsed .clm-gallery-panel-body {
                overflow: hidden !important;
                max-height: 25vh !important; /* 抽屉收起时约显示屏幕 1/4 的内容 */
            }
            
            /* 渐变遮罩，提示下方还有更多内容（深色渐变） */
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body::after {
                content: '' !important;
                position: absolute !important;
                bottom: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 80px !important;
                background: linear-gradient(to bottom, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.95) 100%) !important;
                pointer-events: none !important;
                opacity: 1 !important;
                transition: opacity 0.3s !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-expanded .clm-gallery-panel-body::after {
                opacity: 0 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body p {
                margin: 4px 0 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body .clm-panel-entry-title {
                margin-bottom: 8px !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body .clm-panel-entry-title-tags {
                display: flex !important;
                flex-wrap: wrap !important;
                gap: 6px !important;
                margin-bottom: 6px !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body .clm-panel-entry-title-tag {
                padding: 3px 8px !important;
                border-radius: 4px !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8) !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body .clm-panel-entry-title-text {
                font-size: 16px !important;
                font-weight: 700 !important;
                line-height: 1.4 !important;
                color: #f9fafb !important;
                text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9) !important;
            }
            
            /* 重新显示右侧评论按钮 - 抖音风格 */
            body.clm-mobile-gallery .clm-gallery-panel-comments {
                display: flex !important;
                position: fixed !important;
                right: 8px !important;
                bottom: 200px !important;
                width: auto !important;
                max-height: none !important;
                background: transparent !important;
                padding: 0 !important;
                z-index: 100002 !important;
                flex-direction: column !important;
                gap: 20px !important;
                align-items: center !important;
                transform: none !important;
                border: none !important;
            }
            
            .clm-mobile-comment-btn {
                width: 56px !important;
                height: 56px !important;
                border-radius: 50% !important;
                background: rgba(40, 40, 40, 0.75) !important;
                border: 2px solid rgba(255, 255, 255, 0.2) !important;
                color: #fff !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                touch-action: manipulation !important;
                -webkit-tap-highlight-color: transparent !important;
                box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4) !important;
            }
            
            .clm-mobile-comment-btn:active {
                transform: scale(0.92) !important;
                background: rgba(60, 60, 60, 0.85) !important;
            }
            
            /* 隐藏原有的评论面板头部和内容，只显示按钮 */
            .clm-gallery-panel-comments .clm-gallery-panel-header,
            .clm-gallery-panel-comments .clm-gallery-panel-body {
                display: none !important;
            }
            
            /* 点击评论按钮后展开的评论面板 */
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded {
                position: fixed !important;
                left: 0 !important;
                bottom: 0 !important;
                right: 0 !important;
                top: 30% !important;
                width: 100% !important;
                max-width: 100vw !important;
                max-height: 70vh !important;
                background: rgba(20, 20, 20, 0.98) !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                border-radius: 20px 20px 0 0 !important;
                padding: 20px !important;
                z-index: 100003 !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                transform: none !important;
                display: block !important;
                box-sizing: border-box !important;
                margin: 0 !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-header {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                margin-bottom: 16px !important;
                padding-bottom: 12px !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
                font-size: 18px !important;
                font-weight: 600 !important;
                color: #fff !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body {
                display: block !important;
                max-height: 70vh !important;
                overflow-y: auto !important;
                padding: 16px !important;
                background: rgba(245, 245, 245, 0.95) !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded {
                background: rgba(255, 255, 255, 0.98) !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-header {
                color: #333 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry {
                background: transparent !important;
                border-radius: 0 !important;
                padding: 12px 0 !important;
                margin-bottom: 0 !important;
                border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry:last-child {
                border-bottom: none !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry-user {
                color: #666 !important;
                font-size: 12px !important;
                margin-bottom: 6px !important;
                font-weight: 500 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry-content {
                color: #333 !important;
                font-size: 14px !important;
                line-height: 1.6 !important;
            }
            
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry {
                margin-bottom: 20px !important;
                padding-bottom: 16px !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry:last-child {
                border-bottom: none !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry-user {
                color: rgba(255, 255, 255, 0.7) !important;
                font-size: 13px !important;
                margin-bottom: 8px !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry-text {
                color: #fff !important;
                font-size: 15px !important;
                line-height: 1.6 !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-ads {
                margin: 12px 0 !important;
                padding: 12px !important;
                background: rgba(255, 255, 255, 0.05) !important;
                border-radius: 8px !important;
            }
            
            .clm-gallery-panel-comments.clm-comments-expanded .clm-mobile-comment-btn {
                position: absolute !important;
                top: 16px !important;
                right: 16px !important;
                width: 36px !important;
                height: 36px !important;
                font-size: 20px !important;
            }
            
            /* 隐藏翻页箭头按钮（使用滑动手势） */
            .clm-gallery-arrow-left,
            .clm-gallery-arrow-right {
                display: none !important;
            }
            
            /* 隐藏底部的viewer广告区域 */
            .clm-gallery-ads-slot-viewer-bottom {
                display: none !important;
            }
            
            /* 隐藏 meta、hint 等桌面端提示元素（下载按钮 actions 在手机端保留） */
            .clm-gallery-meta,
            .clm-gallery-hint {
                display: none !important;
            }

            /* 手机端：将下载按钮区域与评论按钮一起放在右侧中部，采用胶囊样式 */
            body.clm-mobile-gallery .clm-gallery-actions {
                position: fixed !important;
                right: 20px !important;
                top: 60% !important;
                bottom: auto !important;
                width: auto !important;
                max-width: none !important;
                padding: 0 !important;
                box-sizing: border-box !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                z-index: 100001 !important; /* 低于主题抽屉(100002)，让抽屉展开时可以遮挡 */
                pointer-events: none !important;
            }

            body.clm-mobile-gallery .clm-gallery-actions .clm-gallery-download-btn {
                pointer-events: auto !important;
                min-width: 120px !important;
                height: 44px !important;
                padding: 0 18px !important;
                border-radius: 22px !important;
                background: rgba(255, 255, 255, 0.9) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important;
                border: none !important;
                color: #333 !important;
                font-weight: 600 !important;
                font-size: 14px !important;
            }
            
            /* 品质徽章 */
            .clm-gallery-quality {
                position: fixed !important;
                top: 60px !important;
                left: 12px !important;
                z-index: 100002 !important;
                font-size: 11px !important;
                padding: 4px 8px !important;
                border-radius: 6px !important;
                background: rgba(0, 0, 0, 0.7) !important;
                color: #fff !important;
                backdrop-filter: blur(8px) !important;
                -webkit-backdrop-filter: blur(8px) !important;
            }
            
            /* 下载预览面板 */
            .clm-gallery-download-preview {
                position: fixed !important;
                left: 50% !important;
                top: 50% !important;
                transform: translate(-50%, -50%) !important;
                width: 90vw !important;
                max-width: 500px !important;
                max-height: 80vh !important;
                padding: 20px !important;
                background: rgba(0, 0, 0, 0.95) !important;
                backdrop-filter: blur(15px) !important;
                -webkit-backdrop-filter: blur(15px) !important;
                border-radius: 16px !important;
                z-index: 100004 !important;
                overflow-y: auto !important;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6) !important;
            }
            
            .clm-gallery-download-preview h3 {
                font-size: 18px !important;
                margin-bottom: 16px !important;
                color: #fff !important;
            }
            
            .clm-gallery-download-preview .clm-download-item {
                padding: 12px !important;
                margin-bottom: 12px !important;
                font-size: 14px !important;
            }
            
            .clm-gallery-download-preview button {
                padding: 12px 18px !important;
                font-size: 15px !important;
                min-height: 48px !important;
                border-radius: 12px !important;
                touch-action: manipulation !important;
                -webkit-tap-highlight-color: transparent !important;
            }
            
            .clm-gallery-download-preview button:active {
                transform: scale(0.97) !important;
            }
            
            /* 点击指示器动画 */
            @keyframes tapFade {
                0% {
                    opacity: 0;
                    transform: translateY(-50%) scale(0.5);
                }
                50% {
                    opacity: 1;
                    transform: translateY(-50%) scale(1);
                }
                100% {
                    opacity: 0;
                    transform: translateY(-50%) scale(1.2);
                }
            }
        `);

        injectStyle(`
            /* 主题内容抽屉内边距：顶部保留空隙，底部尽量贴近屏幕 */
            body.clm-mobile-gallery .clm-gallery-panel-topic {
                padding: 0 0 0 !important; /* 减小左右留白，让内容更居中 */
            }

            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-gallery-panel-body {
                padding: 24px 16px 12px !important; /* 顶部 24px，左右 16px，底部 12px，更接近屏幕底部且留出左右空隙 */
                overflow-x: hidden !important; /* 禁止出现左右滚动条 */
            }

            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry {
                background: transparent !important;
                border-radius: 0 !important;
                padding: 0 0 8px !important;
                margin: 0 !important;
                width: 100% !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry-title {
                margin-bottom: 6px !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry-title-tags {
                margin-bottom: 4px !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry-title-tag {
                text-shadow: none !important;
            }

            /* 标题文字使用浅色并带阴影，适配深色毛玻璃背景 */
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry-title-text {
                color: #f9fafb !important;
                text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9) !important;
            }

            /* 去掉 tips 的上边框，避免在抽屉顶部看到一条“分割线” */
            body.clm-mobile-gallery .clm-gallery-panel-topic .clm-panel-entry-tips {
                border-top: none !important;
                padding-top: 0 !important;
                margin-top: 8px !important;
                color: #e5e7eb !important;
            }

            /* 折叠状态下不再强制 25vh 高度，只让内容自己决定高度 */
            body.clm-mobile-gallery .clm-gallery-panel-topic.clm-topic-collapsed {
                min-height: 25vh !important;
                max-height: 25vh !important;
            }

            /* 画廊 viewer 区域禁止文本选中和图片拖动，避免拖动时出现选中效果 */
            body.clm-mobile-gallery .clm-gallery-viewer,
            body.clm-mobile-gallery .clm-gallery-viewer * {
                -webkit-user-select: none !important;
                user-select: none !important;
            }

            body.clm-mobile-gallery .clm-gallery-viewer img {
                -webkit-user-drag: none !important;
                user-drag: none !important;
            }

            /* 评论抽屉：白底深色文字，提升可读性 */
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded {
                background: rgba(255, 255, 255, 0.98) !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body {
                background: rgba(245, 245, 245, 0.95) !important;
                border-radius: 12px !important;
                overflow: hidden !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-header {
                color: #333 !important;
            }

            /* 手机端评论弹窗右上角关闭按钮样式 */
            body.clm-mobile-gallery .clm-mobile-comment-close {
                font-size: 22px !important;
                margin-left: auto !important;
                cursor: pointer !important;
                padding: 0 6px !important;
                color: #666 !important;
            }

            body.clm-mobile-gallery .clm-mobile-comment-close:active {
                transform: scale(0.9) !important;
            }

            /* 手机端：评论按钮与下载按钮统一尺寸和样式 */
            body.clm-mobile-gallery .clm-gallery-actions .clm-gallery-download-btn,
            body.clm-mobile-gallery .clm-mobile-comment-btn {
                min-width: 120px !important;
                height: 44px !important;
                padding: 0 16px !important;
                border-radius: 22px !important;
                font-size: 14px !important;
                font-weight: 600 !important;
            }

            /* 手机端：为下载按钮添加图标 */
            body.clm-mobile-gallery .clm-gallery-actions .clm-gallery-download-btn::before {
                content: "↓" !important; /* 向下箭头图标 */
                display: inline-block !important;
                margin-right: 6px !important;
                font-size: 16px !important;
                line-height: 1 !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry-user {
                color: #666 !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments .clm-panel-entry-content {
                color: #333 !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry-user {
                color: #666 !important;
            }

            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry-content,
            body.clm-mobile-gallery .clm-gallery-panel-comments.clm-comments-expanded .clm-gallery-panel-body .clm-panel-entry-text {
                color: #333 !important;
            }

            /* 手机端评论触发按钮：完全复刻手机端画廊.html 的 comment-trigger，位置在右侧中部偏上 */
            body.clm-mobile-gallery .clm-mobile-comment-btn {
                position: fixed !important;
                right: 20px !important;
                top: 45% !important;
                bottom: auto !important;
                width: auto !important;
                min-width: 120px !important;
                height: 44px !important;
                padding: 0 16px !important;
                border-radius: 22px !important;
                background: rgba(255, 255, 255, 0.9) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                gap: 8px !important;
                cursor: pointer !important;
                z-index: 2100 !important;
                border: none !important;
                transition: transform 0.2s, background-color 0.2s, top 0.3s !important;
                user-select: none !important;
                color: #333 !important;
                pointer-events: auto !important;
            }

            body.clm-mobile-gallery .clm-mobile-comment-btn:active {
                transform: scale(0.95) !important;
                background-color: #ffffff !important;
            }

            body.clm-mobile-gallery .clm-mobile-comment-btn .comment-icon {
                width: 18px !important;
                height: 18px !important;
            }

            body.clm-mobile-gallery .clm-mobile-comment-btn .comment-label {
                font-size: 14px !important;
                font-weight: 600 !important;
            }

            body.clm-mobile-gallery .clm-gallery-close {
                top: 12px !important;
                right: 12px !important;
            }
        `);
    }

    // 统一的模块初始化入口
    function initMobileModule(ctx) {
        if (!ctx) {
            console.warn('草榴Manager: mobile 模块初始化参数不完整');
            return;
        }
        
        CLM._mobileModuleLoaded = true;
        console.log('草榴Manager: mobile 模块已加载');
        
        // 自动初始化手机端增强
        initMobileEnhancements();
    }
    
    CLM.initMobileModule = CLM.initMobileModule || initMobileModule;
    CLM.initMobileEnhancements = CLM.initMobileEnhancements || initMobileEnhancements;
    CLM.registerMobileGalleryGestures = CLM.registerMobileGalleryGestures || registerMobileGalleryGestures;
    CLM.registerMobileComments = CLM.registerMobileComments || registerMobileComments;
    CLM.initMobileForumEnhancements = CLM.initMobileForumEnhancements || initMobileForumEnhancements;

    if (!CLM._mobileModuleLoaded) {
        CLM._mobileModuleLoaded = true;
        console.log('草榴Manager: mobile 模塊已加載');
    }

    try {
        CLM.initMobileEnhancements();
        if (window.CLM_PENDING_MOBILE_GESTURE_CTX) {
            try {
                CLM.registerMobileGalleryGestures(window.CLM_PENDING_MOBILE_GESTURE_CTX);
            } catch (e) {
                console.warn('草榴Manager: 初始化 mobile 手勢失敗', e);
            }
            window.CLM_PENDING_MOBILE_GESTURE_CTX = null;
        }
        if (window.CLM_PENDING_MOBILE_COMMENTS_CTX) {
            try {
                CLM.registerMobileComments(window.CLM_PENDING_MOBILE_COMMENTS_CTX);
            } catch (e) {
                console.warn('草榴Manager: 初始化 mobile 評論抽屜失敗', e);
            }
            window.CLM_PENDING_MOBILE_COMMENTS_CTX = null;
        }
        if (window.CLM_PENDING_MOBILE_FORUM_CTX) {
            try {
                CLM.initMobileForumEnhancements(window.CLM_PENDING_MOBILE_FORUM_CTX);
            } catch (e) {
                console.warn('草榴Manager: 初始化 mobile 板塊頁失敗', e);
            }
            window.CLM_PENDING_MOBILE_FORUM_CTX = null;
        }
    } catch (e) {
        console.warn('草榴Manager: 初始化 mobile 模塊失敗', e);
    }

})(window);
