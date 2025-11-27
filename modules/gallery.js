// 画廊模块：托管 openGalleryForThread 等核心逻辑
// 主脚本通过 CLM.initGalleryModule(ctx) 传入依赖：
// - fetchThreadData
// - focusGallerySource / clearGallerySourceHighlight
// - markThreadGalleryVisited
// - getCurrentListHoverCtx
// - galleryOverlay: { open, close, isOpen, showLoading }

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    let galleryCtx = null;

    // 注入画质徽章和访问标记 CSS
    function injectGalleryStyles() {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.textContent = `
            .clm-quality-badge {
                position: absolute;
                left: 12px;
                bottom: 12px;
                padding: 3px 8px 4px;
                font-size: 11px;
                line-height: 1.2;
                border-radius: 999px;
                border: 1px solid rgba(255, 255, 255, 0.5);
                background: rgba(12, 12, 20, 0.82);
                color: #fff;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                pointer-events: none;
                display: none;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
                align-items: center;
                justify-content: center;
                min-width: 48px;
                max-width: 80px;
                max-height: 24px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .clm-quality-badge:empty {
                display: none !important;
            }
            #tail .clm-tail-quality {
                left: 12px;
                bottom: 12px;
                top: auto;
                right: auto;
                transform-origin: bottom left;
                transform: translate(
                    calc(var(--clm-tail-extra-x, 0px) * -1),
                    var(--clm-tail-extra-y, 0px)
                ) scale(var(--clm-tail-scale, 1));
                font-size: 13px;
                padding: 4px 12px 5px;
                min-width: 64px;
            }
            .clm-gallery-quality {
                left: 24px;
                bottom: 24px;
                font-size: 14px;
                padding: 5px 16px 6px;
            }
            .wf_item .image-big.clm-gallery-focus-cover,
            .wf_item .image-big.clm-gallery-focus-cover:hover,
            .wf_item .image-big.clm-gallery-visited-cover,
            .wf_item .image-big.clm-gallery-visited-cover:hover {
                box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.85), 0 0 18px rgba(251, 146, 60, 0.45);
                border-radius: 8px;
            }
            .wf_item .image-big.clm-gallery-focus-cover img,
            .wf_item .image-big.clm-gallery-visited-cover img {
                outline: 3px solid rgba(249, 115, 22, 0.85);
                outline-offset: 2px;
            }
            .clm-gallery-focus-title,
            .clm-gallery-visited-title {
                color: #f97316 !important;
                text-shadow: 0 0 6px rgba(0, 0, 0, 0.35);
                font-weight: 700 !important;
            }
        `;
        (document.head || document.getElementsByTagName('head')[0]).appendChild(style);
    }

    // 自动注入样式
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectGalleryStyles);
    } else {
        injectGalleryStyles();
    }

    // 画质标签识别工具
    const QUALITY_TAG_PATTERNS = [
        { tag: '2160P', regex: /\b(2160p|4k|uhd)\b/i },
        { tag: '1440P', regex: /\b(1440p|2k)\b/i },
        { tag: '1080P', regex: /\b1080p\b/i },
        { tag: '720P', regex: /\b720p\b/i },
        { tag: 'BluRay', regex: /\b(bluray|blu-ray|bd)\b/i },
        { tag: 'HDR', regex: /\bHDR\b/i },
        { tag: 'VR', regex: /\bVR\b/i },
        { tag: 'HD', regex: /\bHD\b/i },
        { tag: 'SD', regex: /\bSD\b/i }
    ];

    function detectQualityTagFromTitle(titleText) {
        if (!titleText) return null;
        for (const { tag, regex } of QUALITY_TAG_PATTERNS) {
            if (regex.test(titleText)) {
                return tag;
            }
        }
        return null;
    }

    function resolveQualityTagFromDocument(doc) {
        if (!doc) return null;
        const pieces = [];
        const selectors = [
            '.tpc_title h1',
            '.tpc_title .h',
            '.t table .tr1 h4',
            '.t table .tr2 h4',
            '.t table .tr3 h4',
            '.t table .tr4 h4',
            '.t table .tr5 h4',
            '.tpc_content h1',
            '.tpc_content .tpc_title',
            '.tpc_content strong',
            '.tpc_content b'
        ];
        selectors.forEach((sel) => {
            const el = doc.querySelector(sel);
            if (el?.textContent) {
                pieces.push(el.textContent);
            }
        });
        const keywords = doc.querySelector('meta[name="keywords"]')?.getAttribute('content');
        if (keywords) {
            pieces.push(keywords);
        }
        const description = doc.querySelector('meta[name="description"]')?.getAttribute('content');
        if (description) {
            pieces.push(description);
        }
        if (doc.title) {
            pieces.push(doc.title);
        } else {
            const titleEl = doc.querySelector('title');
            if (titleEl?.textContent) {
                pieces.push(titleEl.textContent);
            }
        }
        return detectQualityTagFromTitle(pieces.join(' '));
    }

    function resolveQualityTagFromListItem(wfItem, threadAnchor = null) {
        if (!wfItem) return null;
        const selectors = [
            '.title a',
            '.title',
            '.subject a',
            '.subject',
            '.t_subject',
            '.tsubject',
            '.wf_text tl',
            '.wf_text .tl',
            '.wf_text a',
            '.wf_text'
        ];
        const pieces = [];
        selectors.forEach((sel) => {
            const el = wfItem.querySelector(sel);
            if (!el) return;
            if (el.textContent) {
                pieces.push(el.textContent);
            }
            if (el.getAttribute) {
                const attrTitle = el.getAttribute('title');
                if (attrTitle) {
                    pieces.push(attrTitle);
                }
            }
        });
        if (threadAnchor) {
            if (threadAnchor.textContent) {
                pieces.push(threadAnchor.textContent);
            }
            const anchorTitle = threadAnchor.getAttribute('title');
            if (anchorTitle) {
                pieces.push(anchorTitle);
            }
        }
        const combined = pieces.join(' ').trim();
        return detectQualityTagFromTitle(combined);
    }

    function updateQualityBadgeElement(badgeEl, tag) {
        if (!badgeEl) return;
        if (tag) {
            badgeEl.textContent = tag.toUpperCase();
            badgeEl.style.display = 'inline-flex';
        } else {
            badgeEl.textContent = '';
            badgeEl.style.display = 'none';
        }
    }

    function bindGalleryVisitedIndicator(element, threadUrl, variant, ctx) {
        if (!element || !threadUrl) return null;
        const normalizeThreadKey = ctx?.normalizeThreadKey;
        const hasGalleryVisitedThread = ctx?.hasGalleryVisitedThread;
        const applyVisitedStateToElement = ctx?.applyVisitedStateToElement;
        
        if (!normalizeThreadKey || !hasGalleryVisitedThread || !applyVisitedStateToElement) {
            console.warn('草榴Manager: bindGalleryVisitedIndicator 缺少必要的上下文函數');
            return null;
        }
        
        const threadKey = normalizeThreadKey(threadUrl);
        if (!threadKey) return null;
        element.dataset.clmThreadKey = threadKey;
        if (variant) {
            element.dataset.clmGalleryVisitedVariant = variant;
        }
        applyVisitedStateToElement(element, hasGalleryVisitedThread(threadKey));
        return threadKey;
    }

    function setupThreadDownloadButton(btn, options, ctx) {
        if (!btn || !options) return;
        
        const normalizeThreadKey = ctx?.normalizeThreadKey;
        const hasDownloadedThread = ctx?.hasDownloadedThread;
        const subscribeDownloadStatus = ctx?.subscribeDownloadStatus;
        const handleThreadDownloadButtonClick = ctx?.handleThreadDownloadButtonClick;
        
        if (!normalizeThreadKey || !hasDownloadedThread || !subscribeDownloadStatus || !handleThreadDownloadButtonClick) {
            console.warn('草榴Manager: setupThreadDownloadButton 缺少必要的上下文函數');
            return;
        }
        
        const defaultLabel = options.label || '下載';
        const downloadedLabel = options.downloadedLabel || '已下載';
        btn.textContent = defaultLabel;
        const threadKey = normalizeThreadKey(options.threadUrl);
        if (!threadKey) {
            btn.disabled = true;
            btn.title = '無法解析帖子地址';
            return;
        }
        const container = options.container || null;
        const containerClass = options.containerClass || '';
        const defaultTitle = '下載到 qBittorrent';
        const downloadedTitle = '已下載，可再次發送到 qBittorrent';
        if (options.threadTitle) {
            btn.dataset.clmThreadTitle = options.threadTitle;
        } else {
            delete btn.dataset.clmThreadTitle;
        }

        const updateState = () => {
            const downloaded = hasDownloadedThread(threadKey);
            btn.classList.toggle('clm-downloaded', downloaded);
            btn.textContent = downloaded ? downloadedLabel : defaultLabel;
            btn.title = downloaded ? downloadedTitle : defaultTitle;
            if (container && containerClass) {
                container.classList.toggle(containerClass, downloaded);
            }
            if (btn.dataset.clmBusy !== '1') {
                btn.disabled = false;
            }
        };

        btn.dataset.clmThreadKey = threadKey;
        btn.__clmRefreshDownloadState = updateState;
        updateState();
        subscribeDownloadStatus(threadKey, () => updateState());

        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (btn.dataset.clmBusy === '1') return;
            handleThreadDownloadButtonClick(btn);
        });
    }

    function createGalleryOverlay(ctx) {
        if (!ctx || typeof ctx.createGalleryOverlayFactory !== 'function') {
            console.warn('草榴Manager: createGalleryOverlay 缺少工廠函數');
            return null;
        }
        // 調用主腳本傳入的工廠函數創建 overlay
        return ctx.createGalleryOverlayFactory(ctx);
    }

    function initGalleryModule(ctx) {
        if (!ctx || typeof ctx.fetchThreadData !== 'function' || !ctx.galleryOverlay) {
            console.warn('草榴Manager: gallery 模塊初始化參數不完整', ctx);
            return;
        }

        galleryCtx = ctx;

        // 初始化後掛載對外接口
        if (!CLM.openGalleryForThread) {
            CLM.openGalleryForThread = openGalleryForThread;
        }
        if (!CLM.createGalleryOverlay) {
            CLM.createGalleryOverlay = createGalleryOverlay;
        }
        CLM._galleryModuleLoaded = true;

        console.log('草榴Manager: gallery 模塊已初始化');
    }

    async function openGalleryForThread(threadUrl, options = {}) {
        if (!galleryCtx || typeof galleryCtx.fetchThreadData !== 'function') {
            console.warn('草榴Manager: gallery 模塊尚未初始化，無法打開畫廊');
            return null;
        }
        if (!threadUrl) return null;

        const {
            fetchThreadData,
            focusGallerySource,
            clearGallerySourceHighlight,
            markThreadGalleryVisited,
            getCurrentListHoverCtx,
            galleryOverlay
        } = galleryCtx;

        const currentListHoverCtx = typeof getCurrentListHoverCtx === 'function'
            ? getCurrentListHoverCtx()
            : null;

        const { instant = false, qualityTag: requestedQualityTag = null } = options;

        if (typeof focusGallerySource === 'function') {
            focusGallerySource(threadUrl, currentListHoverCtx);
        }

        // 使用 ctx 上的計數器避免併發請求亂序
        const loadToken = (galleryCtx.galleryLoadToken = (galleryCtx.galleryLoadToken || 0) + 1);

        if (instant && galleryOverlay && typeof galleryOverlay.showLoading === 'function') {
            galleryOverlay.showLoading();
        }

        const data = await fetchThreadData(threadUrl);
        if (loadToken !== galleryCtx.galleryLoadToken) {
            return null;
        }

        if (!data || !data.gallery || !data.gallery.length) {
            if (typeof clearGallerySourceHighlight === 'function') {
                clearGallerySourceHighlight();
            }
            if (
                instant &&
                galleryOverlay &&
                typeof galleryOverlay.isOpen === 'function' &&
                typeof galleryOverlay.close === 'function' &&
                galleryOverlay.isOpen()
            ) {
                galleryOverlay.close();
            }
            window.alert('未找到該帖子的畫廊內容');
            return null;
        }

        const hoverQualityTag =
            requestedQualityTag ?? (currentListHoverCtx && currentListHoverCtx.qualityTag) ?? null;

        if (galleryOverlay && typeof galleryOverlay.open === 'function') {
            galleryOverlay.open(data.gallery, {
                startIndex: 0,
                topic: data.topic || null,
                comments: data.comments || [],
                download: data.download || null,
                threadUrl,
                qualityTag: data.qualityTag || hoverQualityTag || null,
                ads: data.ads || []
            });
        }

        if (typeof markThreadGalleryVisited === 'function') {
            markThreadGalleryVisited(threadUrl);
        }

        return data;
    }

    CLM.initGalleryModule = CLM.initGalleryModule || initGalleryModule;
    CLM.detectQualityTagFromTitle = CLM.detectQualityTagFromTitle || detectQualityTagFromTitle;
    CLM.resolveQualityTagFromDocument = CLM.resolveQualityTagFromDocument || resolveQualityTagFromDocument;
    CLM.resolveQualityTagFromListItem = CLM.resolveQualityTagFromListItem || resolveQualityTagFromListItem;
    CLM.updateQualityBadgeElement = CLM.updateQualityBadgeElement || updateQualityBadgeElement;
    CLM.bindGalleryVisitedIndicator = CLM.bindGalleryVisitedIndicator || function(element, threadUrl, variant) {
        return bindGalleryVisitedIndicator(element, threadUrl, variant, galleryCtx);
    };
    CLM.setupThreadDownloadButton = CLM.setupThreadDownloadButton || function(btn, options) {
        return setupThreadDownloadButton(btn, options, galleryCtx);
    };

    // 如果主腳本在模塊加載前已經準備好上下文，這裡自動完成初始化
    if (window.CLM_PENDING_GALLERY_CTX) {
        try {
            initGalleryModule(window.CLM_PENDING_GALLERY_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 gallery 模塊失敗', e);
        }
        window.CLM_PENDING_GALLERY_CTX = null;
    }

})(window);
