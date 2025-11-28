// 核心模块：提供所有模块共享的核心功能
// - 网络请求（fetchThreadData）
// - 画廊覆盖层（galleryOverlay）
// - 焦点管理（focusGallerySource、clearGallerySourceHighlight）
// - 上下文管理（getCurrentListHoverCtx）
// - 下载处理（handleThreadDownloadButtonClick）

(function (window) {
    'use strict';

    const CLM = window.CLM || (window.CLM = {});

    // ========================================
    // 全局状态
    // ========================================
    const threadDataCache = new Map();
    let currentListHoverCtx = null;
    let gallerySourceHighlight = null;
    let galleryLoadToken = 0;

    // ========================================
    // 辅助函数
    // ========================================
    
    function getAbsoluteUrl(url, base = location.href) {
        if (!url) return null;
        try {
            return new URL(url, base).href;
        } catch (e) {
            console.warn('草榴Manager: 无法解析 URL', url, e);
            return null;
        }
    }

    // ========================================
    // 焦点和高亮管理
    // ========================================
    
    function setCurrentListHover(ctx) {
        currentListHoverCtx = ctx;
    }

    function getCurrentListHoverCtx() {
        return currentListHoverCtx;
    }

    function clearGallerySourceHighlight() {
        if (gallerySourceHighlight?.element && gallerySourceHighlight.className) {
            try {
                gallerySourceHighlight.element.classList.remove(gallerySourceHighlight.className);
            } catch (err) {
                // 元素可能已被移除，忽略错误
            }
        }
        gallerySourceHighlight = null;
    }

    function applyGallerySourceHighlight(ctx) {
        if (!ctx || !ctx.threadUrl) {
            clearGallerySourceHighlight();
            return;
        }
        let target = null;
        let className = '';
        if (ctx.source === 'board' && ctx.cover instanceof HTMLElement) {
            target = ctx.cover;
            className = 'clm-gallery-focus-cover';
        } else if (ctx.source === 'search' && ctx.titleEl instanceof HTMLElement) {
            target = ctx.titleEl;
            className = 'clm-gallery-focus-title';
        }
        if (!target || !className) {
            clearGallerySourceHighlight();
            return;
        }
        clearGallerySourceHighlight();
        target.classList.add(className);
        gallerySourceHighlight = { element: target, className, threadUrl: ctx.threadUrl };
    }

    function focusGallerySource(threadUrl, ctxOverride = null) {
        if (!threadUrl) {
            clearGallerySourceHighlight();
            return;
        }
        const normalizeThreadKey = CLM.normalizeThreadKey;
        if (!normalizeThreadKey) {
            console.warn('草榴Manager: normalizeThreadKey 未定义');
            return;
        }
        const normalizedTarget = normalizeThreadKey(threadUrl);
        if (!normalizedTarget) {
            clearGallerySourceHighlight();
            return;
        }
        let candidate = ctxOverride;
        if (!candidate || normalizeThreadKey(candidate.threadUrl) !== normalizedTarget) {
            if (currentListHoverCtx && normalizeThreadKey(currentListHoverCtx.threadUrl) === normalizedTarget) {
                candidate = currentListHoverCtx;
            }
        }
        if (candidate) {
            applyGallerySourceHighlight(candidate);
        } else {
            clearGallerySourceHighlight();
        }
    }

    // ========================================
    // 数据收集函数
    // ========================================
    
    function collectGalleryImages(threadContent, baseHref = location.href) {
        if (!threadContent) return [];
        const seen = new Set();
        const gallery = [];

        function pushItem(rawUrl, label) {
            if (!rawUrl) return;
            if (rawUrl.includes('adblo_ck.jpg') || rawUrl.includes('http://a.d/')) return;
            const abs = getAbsoluteUrl(rawUrl, baseHref);
            if (!abs || seen.has(abs)) return;
            seen.add(abs);
            gallery.push({
                src: abs,
                url: abs,
                label: label || ''
            });
        }

        const contentArea = threadContent.querySelector('.tpc_content') || threadContent;
        const allImages = contentArea.querySelectorAll('img[ess-data], img[iyl-data], img[data-src], img[src]');
        
        allImages.forEach(img => {
            const imgUrl = img.getAttribute('ess-data') ||
                img.getAttribute('data-src') ||
                img.getAttribute('iyl-data') ||
                img.src;
            
            if (imgUrl && !imgUrl.includes('adblo_ck.jpg') && !imgUrl.includes('http://a.d/')) {
                const width = img.naturalWidth || img.width || 0;
                const height = img.naturalHeight || img.height || 0;
                if (width < 100 && height < 100 && img.src && !img.getAttribute('ess-data') && !img.getAttribute('data-src')) {
                    return;
                }
                
                const label = img.getAttribute('title') || 
                    img.getAttribute('alt') || 
                    (gallery.length === 0 ? '封面' : `图片 ${gallery.length + 1}`);
                pushItem(imgUrl, label);
            }
        });

        if (gallery.length === 0) {
            const coverImg = threadContent.querySelector('img[ess-data], img[iyl-data], img[data-src], img[src*="pb_"], img[src*="cover"]');
            if (coverImg) {
                const coverUrl = coverImg.getAttribute('ess-data') ||
                    coverImg.getAttribute('data-src') ||
                    coverImg.getAttribute('iyl-data') ||
                    coverImg.src;
                if (coverUrl) {
                    pushItem(coverUrl, coverImg.getAttribute('title') || '封面');
                }
            }
        }

        const galleryAnchors = threadContent.querySelectorAll('.cl-gallery a[href]');
        galleryAnchors.forEach(anchor => {
            const href = anchor.getAttribute('href');
            if (!href) return;
            const label = anchor.querySelector('img')?.getAttribute('title') || anchor.textContent.trim() || '预览';
            pushItem(href, label);
        });

        return gallery;
    }

    function extractCleanText(node) {
        if (!node) return '';
        const clone = node.cloneNode(true);
        const removable = clone.querySelectorAll('script, style, iframe, video, audio');
        removable.forEach(el => el.remove());
        
        const brElements = clone.querySelectorAll('br');
        brElements.forEach(br => {
            const textNode = document.createTextNode('\n');
            br.parentNode.replaceChild(textNode, br);
        });
        
        const text = clone.textContent
            .replace(/\u00A0/g, ' ')
            .replace(/\s+\n/g, '\n')
            .replace(/\n{2,}/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
        return text;
    }

    function extractPostUser(contentEl) {
        if (!contentEl) return '';
        
        if (contentEl.classList && contentEl.classList.contains('tpc_cont')) {
            const parent = contentEl.parentElement;
            if (parent) {
                const detail = parent.querySelector('.tpc_detail');
                if (detail) {
                    const userLink = detail.querySelector('a[href*="usercp.php"]');
                    if (userLink) return userLink.textContent.trim();
                }
            }
        }
        
        const postContainer = contentEl.closest('.t.t2, .t2, .t');
        if (postContainer) {
            const userLink = postContainer.querySelector('a[href*="usercp.php"]');
            if (userLink) return userLink.textContent.trim();
            
            const authorSpan = postContainer.querySelector('.author');
            if (authorSpan) return authorSpan.textContent.trim();
        }
        
        return '';
    }

    function collectThreadContext(doc) {
        let contentBlocks = Array.from(doc.querySelectorAll('.tpc_content'));
        if (!contentBlocks.length) {
            contentBlocks = Array.from(doc.querySelectorAll('.tpc_cont'));
        }
        if (!contentBlocks.length) {
            return {
                topic: null,
                comments: [],
                ads: []
            };
        }

        const allFtadElements = Array.from(doc.querySelectorAll('.ftad-ct'));
        const ads = allFtadElements.map(el => el.outerHTML);

        const posts = contentBlocks.map((el, idx) => {
            const user = extractPostUser(el) || (idx === 0 ? '楼主' : `回复 ${idx}`);
            const content = extractCleanText(el);
            return { user, content };
        });

        const topic = posts.length > 0 ? posts[0] : null;
        const comments = posts.slice(1);

        return { topic, comments, ads };
    }

    function extractThreadDownloadInfo(doc, baseHref = location.href) {
        if (!doc) return null;
        const candidate = doc.querySelector('#rmlink[href], a[href*="rmdown.com/link.php"]');
        if (!candidate) return null;
        const raw = candidate.getAttribute('href') || candidate.href;
        const pageUrl = getAbsoluteUrl(raw, baseHref);
        if (!pageUrl) return null;
        return {
            type: 'rmdown',
            pageUrl
        };
    }

    function resolveQualityTagFromDocument(doc) {
        if (!doc) return null;
        const pieces = [];
        const selectors = [
            '.tpc_title h1',
            '.tpc_title .h',
            '.t table .tr1 h4',
            '.tpc_content h1',
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
        if (keywords) pieces.push(keywords);
        const description = doc.querySelector('meta[name="description"]')?.getAttribute('content');
        if (description) pieces.push(description);
        if (doc.title) pieces.push(doc.title);
        
        const combined = pieces.join(' ');
        const patterns = [
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
        for (const { tag, regex } of patterns) {
            if (regex.test(combined)) {
                return tag;
            }
        }
        return null;
    }

    // ========================================
    // 网络请求：fetchThreadData
    // ========================================
    
    async function fetchThreadData(threadUrl) {
        if (!threadUrl) return null;
        const normalized = getAbsoluteUrl(threadUrl);
        if (!normalized) return null;
        if (threadDataCache.has(normalized)) {
            return threadDataCache.get(normalized);
        }
        const fetchPromise = (async () => {
            try {
                const resp = await fetch(normalized, { credentials: 'include' });
                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }
                const html = await resp.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                let threadContent = doc.querySelector('.tpc_content');
                if (!threadContent) {
                    threadContent = doc.querySelector('.tpc_cont') || doc.querySelector('#main') || doc.body;
                }
                
                const gallery = collectGalleryImages(threadContent, normalized);
                const { topic, comments, ads } = collectThreadContext(doc);
                const download = extractThreadDownloadInfo(doc, normalized);
                const qualityTag = resolveQualityTagFromDocument(doc);
                return { gallery, topic, comments, download, qualityTag, ads };
            } catch (err) {
                console.error('草榴Manager: 论坛画廊载入失败', normalized, err);
                return { gallery: [], topic: null, comments: [], ads: [] };
            }
        })();
        threadDataCache.set(normalized, fetchPromise);
        return fetchPromise;
    }

    // ========================================
    // 画廊入口：openGalleryForThread
    // ========================================

    async function openGalleryForThread(threadUrl, options = {}) {
        if (!threadUrl) return null;

        const { instant = false, qualityTag: requestedQualityTag = null } = options;

        // 根据当前悬停项高亮来源
        try {
            focusGallerySource(threadUrl, currentListHoverCtx);
        } catch (e) {
            console.warn('草榴Manager: focusGallerySource 调用失败', e);
        }

        const loadToken = ++galleryLoadToken;
        const overlay = CLM.galleryOverlay || createGalleryOverlayFactory({});

        if (instant && overlay && typeof overlay.showLoading === 'function') {
            overlay.showLoading();
        }

        const data = await fetchThreadData(threadUrl);
        if (loadToken !== galleryLoadToken) {
            // 已有新的加载请求，丢弃本次结果
            return null;
        }

        if (!data || !Array.isArray(data.gallery) || !data.gallery.length) {
            clearGallerySourceHighlight();
            if (instant && overlay && typeof overlay.isOpen === 'function' && overlay.isOpen() && typeof overlay.close === 'function') {
                overlay.close();
            }
            alert('未找到该帖子的画廊内容');
            return null;
        }

        const hoverQualityTag =
            requestedQualityTag ?? (currentListHoverCtx && currentListHoverCtx.qualityTag) ?? null;

        if (overlay && typeof overlay.open === 'function') {
            try {
                overlay.open(data.gallery, {
                    startIndex: 0,
                    topic: data.topic || null,
                    comments: data.comments || [],
                    download: data.download || null,
                    threadUrl,
                    qualityTag: data.qualityTag || hoverQualityTag || null,
                    ads: data.ads || []
                });
            } catch (e) {
                console.warn('草榴Manager: 打开画廊失败', e);
            }
        }

        if (typeof CLM.markThreadGalleryVisited === 'function') {
            try {
                CLM.markThreadGalleryVisited(threadUrl);
            } catch (e) {
                console.warn('草榴Manager: 标记画廊访问状态失败', e);
            }
        }

        return data;
    }

    // ========================================
    // 下载按钮点击处理（简化版）
    // ========================================
    
    async function handleThreadDownloadButtonClick(btn) {
        // 优先使用 clmThreadUrl（完整URL），如果没有则使用 clmThreadKey
        const threadUrl = btn.dataset.clmThreadUrl || btn.dataset.clmThreadKey;
        if (!threadUrl) return;
        btn.dataset.clmBusy = '1';
        btn.disabled = true;
        btn.textContent = '载入中...';
        
        try {
            const threadData = await fetchThreadData(threadUrl);
            if (!threadData || !threadData.download || !threadData.download.pageUrl) {
                alert('该帖子没有可解析的下载链接。');
                return;
            }
            
            // 简化实现：直接打开下载页面
            window.open(threadData.download.pageUrl, '_blank');
            
            // 标记为已下载
            if (CLM.markThreadDownloaded) {
                const normalizeThreadKey = CLM.normalizeThreadKey;
                if (normalizeThreadKey) {
                    const key = normalizeThreadKey(threadUrl);
                    if (key) {
                        CLM.markThreadDownloaded(key);
                    }
                }
            }
        } catch (e) {
            console.error('草榴Manager: 下载处理失败', e);
            alert('下载处理失败：' + e.message);
        } finally {
            btn.dataset.clmBusy = '0';
            if (typeof btn.__clmRefreshDownloadState === 'function') {
                btn.__clmRefreshDownloadState();
            } else {
                btn.disabled = false;
            }
        }
    }

    // ========================================
    // 画廊覆盖层工厂函数（简化版）
    // ========================================
    
    function createGalleryOverlayFactory(ctx) {
        console.log('草榴Manager: core 模块创建画廊覆盖层（简化版）');
        
        // 这是一个简化的实现，完整版在旧脚本中有几千行
        // 这里只提供基本的接口，实际功能需要在 desktop.js 中完善
        
        let isOpen = false;
        let currentGallery = [];
        
        return {
            open: function(gallery, options = {}) {
                console.log('草榴Manager: 画廊打开', gallery.length, '张图片');
                isOpen = true;
                currentGallery = gallery;
                // TODO: 在 desktop.js 中实现完整的画廊 UI
                if (gallery.length > 0) {
                    // 简化实现：在新标签页打开第一张图片
                    window.open(gallery[0].url, '_blank');
                }
            },
            close: function() {
                console.log('草榴Manager: 画廊关闭');
                isOpen = false;
                currentGallery = [];
            },
            isOpen: function() {
                return isOpen;
            },
            showLoading: function() {
                console.log('草榴Manager: 显示加载中...');
            }
        };
    }

    // ========================================
    // Gallery 辅助函数（mobile 模块需要）
    // ========================================
    
    function bindGalleryVisitedIndicator(element, threadUrl, variant) {
        if (!element || !threadUrl) return null;
        const normalizeThreadKey = CLM.normalizeThreadKey;
        const hasGalleryVisitedThread = CLM.hasGalleryVisitedThread;
        const applyVisitedStateToElement = CLM.applyVisitedStateToElement;
        
        if (!normalizeThreadKey || !hasGalleryVisitedThread || !applyVisitedStateToElement) {
            console.warn('草榴Manager: bindGalleryVisitedIndicator 缺少必要函数');
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

    function setupThreadDownloadButton(btn, options = {}) {
        if (!btn || !options) return;
        
        const normalizeThreadKey = CLM.normalizeThreadKey;
        const hasDownloadedThread = CLM.hasDownloadedThread;
        const subscribeDownloadStatus = CLM.subscribeDownloadStatus;
        
        if (!normalizeThreadKey || !hasDownloadedThread || !subscribeDownloadStatus) {
            console.warn('草榴Manager: setupThreadDownloadButton 缺少必要函数');
            return;
        }
        
        const defaultLabel = options.label || '下载';
        const downloadedLabel = options.downloadedLabel || '已下载';
        btn.textContent = defaultLabel;
        const threadKey = normalizeThreadKey(options.threadUrl);
        if (!threadKey) {
            btn.disabled = true;
            btn.title = '无法解析帖子地址';
            return;
        }
        const container = options.container || null;
        const containerClass = options.containerClass || '';
        const defaultTitle = '下载到 qBittorrent';
        const downloadedTitle = '已下载，可再次发送到 qBittorrent';
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
        btn.dataset.clmThreadUrl = options.threadUrl; // 保存完整URL
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

    // ========================================
    // 初始化核心模块
    // ========================================
    
    function initCoreModule(ctx) {
        console.log('草榴Manager: core 模块已加载');
        
        // 注入清晰度徽章的基础样式，使桌面端和手机端外观与舊版保持一致
        try {
            const inject = (ctx && ctx.injectStyle) || CLM.injectStyle;
            if (typeof inject === 'function') {
                inject(`
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
                `);
            }
        } catch (e) {
            console.warn('草榴Manager: 注入清晰度徽章樣式失敗', e);
        }

        // 将核心函数暴露到 CLM 命名空间
        CLM.fetchThreadData = fetchThreadData;
        CLM.openGalleryForThread = openGalleryForThread;
        CLM.focusGallerySource = focusGallerySource;
        CLM.clearGallerySourceHighlight = clearGallerySourceHighlight;
        CLM.getCurrentListHoverCtx = getCurrentListHoverCtx;
        CLM.setCurrentListHoverCtx = setCurrentListHover;
        CLM.handleThreadDownloadButtonClick = handleThreadDownloadButtonClick;
        CLM.createGalleryOverlayFactory = createGalleryOverlayFactory;
        
        // Gallery 辅助函数
        CLM.bindGalleryVisitedIndicator = bindGalleryVisitedIndicator;
        CLM.updateQualityBadgeElement = updateQualityBadgeElement;
        CLM.resolveQualityTagFromListItem = resolveQualityTagFromListItem;
        CLM.detectQualityTagFromTitle = detectQualityTagFromTitle;
        CLM.setupThreadDownloadButton = setupThreadDownloadButton;
        
        // 创建画廊覆盖层
        CLM.galleryOverlay = createGalleryOverlayFactory(ctx);
        
        CLM._coreModuleLoaded = true;
    }

    // 暴露初始化函数
    CLM.initCoreModule = CLM.initCoreModule || initCoreModule;

    // 如果有待处理的上下文，立即初始化
    if (window.CLM_PENDING_CORE_CTX) {
        try {
            initCoreModule(window.CLM_PENDING_CORE_CTX);
        } catch (e) {
            console.warn('草榴Manager: 初始化 core 模块失败', e);
        }
        delete window.CLM_PENDING_CORE_CTX;
    }

})(window);
