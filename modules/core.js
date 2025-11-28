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
    // 下载按钮点击处理（简化版）
    // ========================================
    
    async function handleThreadDownloadButtonClick(btn) {
        const threadKey = btn.dataset.clmThreadKey;
        if (!threadKey) return;
        btn.dataset.clmBusy = '1';
        btn.disabled = true;
        btn.textContent = '载入中...';
        
        try {
            const threadData = await fetchThreadData(threadKey);
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
                    const key = normalizeThreadKey(threadKey);
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
    // 初始化核心模块
    // ========================================
    
    function initCoreModule(ctx) {
        console.log('草榴Manager: core 模块已加载');
        
        // 将核心函数暴露到 CLM 命名空间
        CLM.fetchThreadData = fetchThreadData;
        CLM.focusGallerySource = focusGallerySource;
        CLM.clearGallerySourceHighlight = clearGallerySourceHighlight;
        CLM.getCurrentListHoverCtx = getCurrentListHoverCtx;
        CLM.setCurrentListHoverCtx = setCurrentListHover;
        CLM.handleThreadDownloadButtonClick = handleThreadDownloadButtonClick;
        CLM.createGalleryOverlayFactory = createGalleryOverlayFactory;
        
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
