// bro.decor — Window decoration frame geometry, button layout, shadow margins,
// and pointer hit-testing.

(function () {
    'use strict';

    const mount = (root, name) => (root[name] !== undefined ? root[name] : (root[name] = {}));

    const DEFAULT_METRICS = {
        captionHeight: 32,
        borderThickness: 4,
        resizeGripSize: 8,
        cornerRadius: 8,
        cornerGripLength: 24,
        buttonWidth: 36,
        buttonHeight: 24,
        buttonSpacing: 2,
        buttonMarginRight: 6,
        buttonMarginLeft: 6,
        titleMarginLeft: 10,
        titleMarginRight: 10,
        iconSize: 16,
        iconMarginLeft: 10,
        leftHandedButtons: false,
        buttons: ['Minimize', 'Maximize', 'Close'],
        shadow: {
            size: 24,
            offsetX: 0,
            offsetY: 6,
            spread: 0,
        },
    };

    const emptyRect = () => ({ x: 0, y: 0, width: 0, height: 0 });
    const emptyMargins = () => ({ left: 0, top: 0, right: 0, bottom: 0 });

    const rectContains = (r, px, py) =>
        r && r.width > 0 && r.height > 0 && px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height;

    const toRect = (v) => {
        if (!v || typeof v !== 'object') return emptyRect();
        return {
            x: typeof v.x === 'number' ? v.x : 0,
            y: typeof v.y === 'number' ? v.y : 0,
            width: typeof v.width === 'number' ? v.width : 0,
            height: typeof v.height === 'number' ? v.height : 0,
        };
    };

    const parseState = (s) => {
        if (s === 'maximized' || s === 'Maximized') return 'maximized';
        if (s === 'fullscreen' || s === 'Fullscreen') return 'fullscreen';
        if (s === 'tiled' || s === 'tiled_left' || s === 'tiled_right' || s === 'Tiled') return 'tiled';
        if (s === 'inactive' || s === 'Inactive') return 'inactive';
        if (s === 'normal' || s === 'Normal') return 'active';
        return 'active';
    };

    const effectiveBorders = (m, state) => {
        if (state === 'fullscreen' || state === 'maximized') return emptyMargins();
        if (state === 'tiled') {
            const t = Math.min(m.borderThickness, 1);
            return { left: t, top: t, right: t, bottom: t };
        }
        const b = m.borderThickness;
        return { left: b, top: b, right: b, bottom: b };
    };

    const effectiveCaptionHeight = (m, state) => (state === 'fullscreen' ? 0 : m.captionHeight);

    const calcShadowMargins = (sh) => {
        if (sh.size <= 0 && sh.spread <= 0) return emptyMargins();
        return {
            left: Math.max(0, sh.size - sh.offsetX + sh.spread),
            top: Math.max(0, sh.size - sh.offsetY + sh.spread),
            right: Math.max(0, sh.size + sh.offsetX + sh.spread),
            bottom: Math.max(0, sh.size + sh.offsetY + sh.spread),
        };
    };

    function getDefaultMetrics() {
        return {
            captionHeight: DEFAULT_METRICS.captionHeight,
            borderThickness: DEFAULT_METRICS.borderThickness,
            resizeGripSize: DEFAULT_METRICS.resizeGripSize,
            cornerRadius: DEFAULT_METRICS.cornerRadius,
            cornerGripLength: DEFAULT_METRICS.cornerGripLength,
            buttonWidth: DEFAULT_METRICS.buttonWidth,
            buttonHeight: DEFAULT_METRICS.buttonHeight,
            buttonSpacing: DEFAULT_METRICS.buttonSpacing,
            shadowRadius: DEFAULT_METRICS.shadow.size,
        };
    }

    function computeGeometry(options) {
        if (!options || typeof options !== 'object') return null;

        const clientRect = toRect(options.clientRect);
        if (clientRect.width <= 0) clientRect.width = 800;
        if (clientRect.height <= 0) clientRect.height = 600;

        const m = {
            captionHeight: DEFAULT_METRICS.captionHeight,
            borderThickness: DEFAULT_METRICS.borderThickness,
            resizeGripSize: DEFAULT_METRICS.resizeGripSize,
            cornerRadius: DEFAULT_METRICS.cornerRadius,
            cornerGripLength: DEFAULT_METRICS.cornerGripLength,
            buttonWidth: DEFAULT_METRICS.buttonWidth,
            buttonHeight: DEFAULT_METRICS.buttonHeight,
            buttonSpacing: DEFAULT_METRICS.buttonSpacing,
            buttonMarginRight: DEFAULT_METRICS.buttonMarginRight,
            buttonMarginLeft: DEFAULT_METRICS.buttonMarginLeft,
            titleMarginLeft: DEFAULT_METRICS.titleMarginLeft,
            titleMarginRight: DEFAULT_METRICS.titleMarginRight,
            iconSize: DEFAULT_METRICS.iconSize,
            leftHandedButtons: DEFAULT_METRICS.leftHandedButtons,
            buttons: DEFAULT_METRICS.buttons,
            shadow: { ...DEFAULT_METRICS.shadow },
        };

        const mo = options.metrics;
        if (mo && typeof mo === 'object') {
            if (typeof mo.captionHeight === 'number') m.captionHeight = mo.captionHeight;
            if (typeof mo.borderThickness === 'number') m.borderThickness = mo.borderThickness;
            if (typeof mo.resizeGripSize === 'number') m.resizeGripSize = mo.resizeGripSize;
            if (typeof mo.cornerRadius === 'number') m.cornerRadius = mo.cornerRadius;
            if (typeof mo.cornerGripLength === 'number') m.cornerGripLength = mo.cornerGripLength;
            if (typeof mo.buttonWidth === 'number') m.buttonWidth = mo.buttonWidth;
            if (typeof mo.buttonHeight === 'number') m.buttonHeight = mo.buttonHeight;
            if (typeof mo.buttonSpacing === 'number') m.buttonSpacing = mo.buttonSpacing;
            if (typeof mo.shadowRadius === 'number') m.shadow.size = mo.shadowRadius;
            if (typeof mo.leftHandedButtons === 'boolean') m.leftHandedButtons = mo.leftHandedButtons;
        }

        const state = typeof options.state === 'string' ? parseState(options.state) : 'active';
        const borders = effectiveBorders(m, state);
        const H = effectiveCaptionHeight(m, state);

        const frameRect = {
            x: clientRect.x - borders.left,
            y: clientRect.y - (borders.top + H),
            width: clientRect.width + borders.left + borders.right,
            height: clientRect.height + borders.top + borders.bottom + H,
        };

        const captionRect = H > 0
            ? {
                x: frameRect.x + borders.left,
                y: frameRect.y + borders.top,
                width: Math.max(0, frameRect.width - (borders.left + borders.right)),
                height: H,
            }
            : emptyRect();

        const buttons = [];
        const btnW = m.buttonWidth;
        const btnH = Math.min(H, m.buttonHeight);
        const btnY = captionRect.y + Math.max(0, (H - btnH) * 0.5);
        const nBtns = m.buttons.length;

        if (H > 0 && nBtns > 0) {
            if (!m.leftHandedButtons) {
                const rightEdge = captionRect.x + captionRect.width - m.buttonMarginRight;
                for (let i = 0; i < nBtns; ++i) {
                    let k = m.buttons[i];
                    if (state === 'maximized' && k === 'Maximize') k = 'Restore';
                    else if (state !== 'maximized' && k === 'Restore') k = 'Maximize';
                    const fromRight = nBtns - 1 - i;
                    const bx = rightEdge - (fromRight + 1) * btnW - fromRight * m.buttonSpacing;
                    buttons.push({ kind: k, rect: { x: bx, y: btnY, width: btnW, height: btnH } });
                }
            } else {
                const leftEdge = captionRect.x + m.buttonMarginLeft;
                for (let i = 0; i < nBtns; ++i) {
                    let k = m.buttons[i];
                    if (state === 'maximized' && k === 'Maximize') k = 'Restore';
                    else if (state !== 'maximized' && k === 'Restore') k = 'Maximize';
                    const bx = leftEdge + i * (btnW + m.buttonSpacing);
                    buttons.push({ kind: k, rect: { x: bx, y: btnY, width: btnW, height: btnH } });
                }
            }
        }

        let iconRect = emptyRect();
        let titleRect = emptyRect();
        if (H > 0) {
            let availLeft = captionRect.x + m.titleMarginLeft;
            let availRight = captionRect.x + captionRect.width - m.titleMarginRight;
            if (!m.leftHandedButtons && buttons.length > 0) {
                availRight = buttons[0].rect.x - m.buttonSpacing;
            } else if (m.leftHandedButtons && buttons.length > 0) {
                const last = buttons[buttons.length - 1].rect;
                availLeft = last.x + last.width + m.buttonSpacing;
            }
            let contentX = availLeft;
            if (m.iconSize > 0) {
                iconRect = {
                    x: contentX,
                    y: captionRect.y + (H - m.iconSize) * 0.5,
                    width: m.iconSize,
                    height: m.iconSize,
                };
                contentX += m.iconSize + 6;
            }
            titleRect = {
                x: contentX,
                y: captionRect.y,
                width: Math.max(0, availRight - contentX),
                height: H,
            };
        }

        const isFlat = state === 'maximized' || state === 'fullscreen' || state === 'tiled';
        const shadowMargins = isFlat ? emptyMargins() : calcShadowMargins(m.shadow);
        const shadowRect = isFlat
            ? { ...frameRect }
            : {
                x: frameRect.x - shadowMargins.left,
                y: frameRect.y - shadowMargins.top,
                width: frameRect.width + shadowMargins.left + shadowMargins.right,
                height: frameRect.height + shadowMargins.top + shadowMargins.bottom,
            };

        let grips;
        if (!isFlat && frameRect.width > 0 && frameRect.height > 0) {
            const G = m.resizeGripSize;
            const L = m.cornerGripLength;
            const fw = frameRect.width;
            const fh = frameRect.height;
            const fx = frameRect.x;
            const fy = frameRect.y;
            const clX = Math.min(L, fw * 0.5);
            const clY = Math.min(L, fh * 0.5);

            grips = {
                topLeft: { x: fx - G * 0.5, y: fy - G * 0.5, width: clX + G * 0.5, height: clY + G * 0.5 },
                topRight: { x: fx + fw - clX, y: fy - G * 0.5, width: clX + G * 0.5, height: clY + G * 0.5 },
                bottomLeft: { x: fx - G * 0.5, y: fy + fh - clY, width: clX + G * 0.5, height: clY + G * 0.5 },
                bottomRight: { x: fx + fw - clX, y: fy + fh - clY, width: clX + G * 0.5, height: clY + G * 0.5 },
                top: { x: fx + clX, y: fy - G * 0.5, width: Math.max(0, fw - 2 * clX), height: G },
                bottom: { x: fx + clX, y: fy + fh - G * 0.5, width: Math.max(0, fw - 2 * clX), height: G },
                left: { x: fx - G * 0.5, y: fy + clY, width: G, height: Math.max(0, fh - 2 * clY) },
                right: { x: fx + fw - G * 0.5, y: fy + clY, width: G, height: Math.max(0, fh - 2 * clY) },
            };
        } else {
            grips = {
                top: emptyRect(),
                bottom: emptyRect(),
                left: emptyRect(),
                right: emptyRect(),
                topLeft: emptyRect(),
                topRight: emptyRect(),
                bottomLeft: emptyRect(),
                bottomRight: emptyRect(),
            };
        }

        return {
            frameRect,
            clientRect,
            captionRect,
            titleRect,
            iconRect,
            shadowRect,
            state,
            grips,
            buttons,
            shadowMargins,
        };
    }

    const makeHitResult = (area, edge = 'None', buttonIndex = -1, buttonKind = null) => ({
        area,
        edge,
        isClient: area === 'Client',
        isCaption: area === 'Caption',
        isButton: area === 'Button',
        isResizable: area === 'ResizeBorder' && edge !== 'None',
        isDraggable: area === 'Caption',
        isShadow: area === 'Shadow',
        buttonIndex,
        buttonKind,
    });

    function hitTest(geom, point) {
        if (!geom || typeof geom !== 'object' || !point || typeof point !== 'object') return null;

        const px = typeof point.x === 'number' ? point.x : 0;
        const py = typeof point.y === 'number' ? point.y : 0;
        const state = typeof geom.state === 'string' ? parseState(geom.state) : 'active';
        const resizable = state !== 'maximized' && state !== 'fullscreen' && state !== 'tiled';

        // 1. Buttons take top priority
        const btns = geom.buttons;
        if (Array.isArray(btns)) {
            for (let i = 0; i < btns.length; ++i) {
                const b = btns[i];
                if (b && rectContains(b.rect, px, py)) {
                    return makeHitResult('Button', 'None', i, b.kind || null);
                }
            }
        }

        // 2. Resize grips (corners before edges)
        if (resizable && geom.grips && typeof geom.grips === 'object') {
            const g = geom.grips;
            const order = [
                ['topLeft', 'TopLeft'],
                ['topRight', 'TopRight'],
                ['bottomLeft', 'BottomLeft'],
                ['bottomRight', 'BottomRight'],
                ['top', 'Top'],
                ['bottom', 'Bottom'],
                ['left', 'Left'],
                ['right', 'Right'],
            ];
            for (let i = 0; i < order.length; ++i) {
                const r = g[order[i][0]];
                if (rectContains(r, px, py)) {
                    return makeHitResult('ResizeBorder', order[i][1]);
                }
            }
        }

        // 3. Caption bar
        if (rectContains(geom.captionRect, px, py)) {
            return makeHitResult('Caption');
        }

        // 4. Client content area
        if (rectContains(geom.clientRect, px, py)) {
            return makeHitResult('Client');
        }

        // 5. Visible frame borders
        if (rectContains(geom.frameRect, px, py)) {
            if (resizable) {
                const cr = geom.clientRect || emptyRect();
                let edge = 'None';
                if (py < cr.y) edge = 'Top';
                else if (py >= cr.y + cr.height) edge = 'Bottom';
                else if (px < cr.x) edge = 'Left';
                else if (px >= cr.x + cr.width) edge = 'Right';
                return makeHitResult('ResizeBorder', edge);
            }
            return makeHitResult('Caption');
        }

        // 6. Drop shadow area
        if (rectContains(geom.shadowRect, px, py)) {
            return makeHitResult('Shadow');
        }

        return makeHitResult('None');
    }

    const ns = mount(globalThis.bro, 'decor');
    ns.getDefaultMetrics = getDefaultMetrics;
    ns.computeGeometry = computeGeometry;
    ns.hitTest = hitTest;
})();
