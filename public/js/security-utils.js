(function () {
    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeHtmlFallback(html) {
        let safe = String(html ?? '');

        safe = safe.replace(/<\s*(script|style|iframe|object|embed|svg|math|meta|link|img|video|audio|source|track)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
        safe = safe.replace(/<\s*(script|style|iframe|object|embed|svg|math|meta|link|img|video|audio|source|track)[^>]*\/?>/gi, '');
        safe = safe.replace(/\s+on[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
        safe = safe.replace(/\s+(href|src|xlink:href|formaction)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '');
        safe = safe.replace(/\s+style\s*=\s*(".*?(expression|javascript:).*?"|'.*?(expression|javascript:).*?')/gi, '');

        return safe;
    }

    function sanitizeHtml(html) {
        const input = String(html ?? '');
        if (typeof DOMParser === 'undefined') {
            return sanitizeHtmlFallback(input);
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<template>${input}</template>`, 'text/html');
        const template = doc.querySelector('template');
        const blockedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'META', 'LINK', 'IMG', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK']);
        const allowedTags = new Set([
            'DIV', 'SPAN', 'P', 'STRONG', 'SMALL', 'BR', 'HR',
            'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
            'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'LABEL', 'FORM',
            'A', 'UL', 'OL', 'LI',
            'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
            'HEADER', 'FOOTER', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'NAV',
            'I', 'B', 'EM'
        ]);

        const walker = doc.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null);
        const toRemove = [];
        const toReplaceWithText = [];

        while (walker.nextNode()) {
            const el = walker.currentNode;
            if (blockedTags.has(el.tagName)) {
                toRemove.push(el);
                continue;
            }

            if (!allowedTags.has(el.tagName)) {
                toReplaceWithText.push(el);
                continue;
            }

            for (const attr of Array.from(el.attributes)) {
                const name = attr.name.toLowerCase();
                const value = attr.value.trim().toLowerCase();

                if (name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                    continue;
                }

                if (['href', 'src', 'xlink:href', 'formaction'].includes(name) && value.startsWith('javascript:')) {
                    el.removeAttribute(attr.name);
                    continue;
                }

                if (name === 'style' && (value.includes('javascript:') || value.includes('expression('))) {
                    el.removeAttribute(attr.name);
                }
            }
        }

        for (const node of toRemove) {
            node.remove();
        }

        for (const node of toReplaceWithText) {
            const textNode = doc.createTextNode(node.textContent || '');
            node.replaceWith(textNode);
        }

        return template.innerHTML;
    }

    function setSanitizedHTML(element, html) {
        if (!element) {
            return;
        }
        element.innerHTML = sanitizeHtml(html);
    }

    function hardenInnerHTMLSetter() {
        if (typeof Element === 'undefined') {
            return;
        }

        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        if (!descriptor || typeof descriptor.set !== 'function' || descriptor.set.__rekerHardened) {
            return;
        }

        const originalSet = descriptor.set;
        const hardenedSet = function (value) {
            originalSet.call(this, sanitizeHtml(value));
        };
        hardenedSet.__rekerHardened = true;

        Object.defineProperty(Element.prototype, 'innerHTML', {
            configurable: true,
            enumerable: descriptor.enumerable,
            get: descriptor.get,
            set: hardenedSet
        });
    }

    const SecurityUtils = {
        escapeHtml,
        sanitizeHtml,
        sanitizeHtmlFallback,
        setSanitizedHTML,
        hardenInnerHTMLSetter
    };

    if (typeof window !== 'undefined') {
        window.SecurityUtils = SecurityUtils;
        SecurityUtils.hardenInnerHTMLSetter();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SecurityUtils;
    }
})();
