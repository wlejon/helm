// Headless test for bro.decor
assert(typeof bro.decor === 'object', 'bro.decor namespace exists');
if (!bro.decor.available) {
    skipTest('bro.decor is compiled out of this build');
} else {
    // 1. Default metrics
    const def = bro.decor.getDefaultMetrics();
    assert(def.captionHeight === 32, 'default captionHeight is 32');
    assert(def.borderThickness === 4, 'default borderThickness is 4');
    assert(def.resizeGripSize === 8, 'default resizeGripSize is 8');
    assert(def.cornerRadius === 8, 'default cornerRadius is 8');
    assert(def.cornerGripLength === 24, 'default cornerGripLength is 24');
    assert(def.buttonWidth === 36 && def.buttonHeight === 24 && def.buttonSpacing === 2, 'default button metrics');
    assert(def.shadowRadius === 24, 'default shadowRadius is 24');

    // 2. Active geometry + default clientRect fallback
    const defGeom = bro.decor.computeGeometry({ clientRect: { x: 0, y: 0, width: 0, height: 0 } });
    assert(defGeom.clientRect.width === 800 && defGeom.clientRect.height === 600, 'zero clientRect defaults to 800x600');

    const geom = bro.decor.computeGeometry({
        clientRect: { x: 100, y: 100, width: 800, height: 600 },
        state: 'active',
        title: 'Test Window',
    });
    assert(geom.state === 'active', 'active state');
    assert(geom.frameRect.x === 96 && geom.frameRect.y === 64, 'frame origin includes border + caption');
    assert(geom.frameRect.width === 808 && geom.frameRect.height === 640, 'frame size includes borders + caption');
    assert(geom.captionRect.x === 100 && geom.captionRect.y === 68 && geom.captionRect.width === 800 && geom.captionRect.height === 32, 'captionRect');
    assert(geom.buttons.length === 3, '3 caption buttons');
    assert(geom.buttons[0].kind === 'Minimize' && geom.buttons[1].kind === 'Maximize' && geom.buttons[2].kind === 'Close', 'button kinds');
    assert(geom.shadowMargins.left === 24 && geom.shadowMargins.top === 18 && geom.shadowMargins.right === 24 && geom.shadowMargins.bottom === 30, 'shadowMargins');

    // 3. Hit testing in active state
    const closeBtn = geom.buttons[2].rect;
    const hitClose = bro.decor.hitTest(geom, { x: closeBtn.x + 5, y: closeBtn.y + 5 });
    assert(hitClose.area === 'Button' && hitClose.isButton === true && hitClose.buttonIndex === 2 && hitClose.buttonKind === 'Close', 'hitTest Close button');

    const hitCap = bro.decor.hitTest(geom, { x: 200, y: 80 });
    assert(hitCap.area === 'Caption' && hitCap.isCaption === true && hitCap.isDraggable === true, 'hitTest Caption');

    const hitClient = bro.decor.hitTest(geom, { x: 300, y: 300 });
    assert(hitClient.area === 'Client' && hitClient.isClient === true, 'hitTest Client');

    const hitTL = bro.decor.hitTest(geom, { x: geom.frameRect.x, y: geom.frameRect.y });
    assert(hitTL.area === 'ResizeBorder' && hitTL.edge === 'TopLeft' && hitTL.isResizable === true, 'hitTest TopLeft corner priority');

    const hitTR = bro.decor.hitTest(geom, { x: geom.frameRect.x + geom.frameRect.width - 1, y: geom.frameRect.y });
    assert(hitTR.area === 'ResizeBorder' && hitTR.edge === 'TopRight', 'hitTest TopRight');

    const hitBL = bro.decor.hitTest(geom, { x: geom.frameRect.x, y: geom.frameRect.y + geom.frameRect.height - 1 });
    assert(hitBL.area === 'ResizeBorder' && hitBL.edge === 'BottomLeft', 'hitTest BottomLeft');

    const hitBR = bro.decor.hitTest(geom, { x: geom.frameRect.x + geom.frameRect.width - 1, y: geom.frameRect.y + geom.frameRect.height - 1 });
    assert(hitBR.area === 'ResizeBorder' && hitBR.edge === 'BottomRight', 'hitTest BottomRight');

    const hitTop = bro.decor.hitTest(geom, { x: 400, y: geom.frameRect.y });
    assert(hitTop.area === 'ResizeBorder' && hitTop.edge === 'Top', 'hitTest Top edge');

    const hitBot = bro.decor.hitTest(geom, { x: 400, y: geom.frameRect.y + geom.frameRect.height - 1 });
    assert(hitBot.area === 'ResizeBorder' && hitBot.edge === 'Bottom', 'hitTest Bottom edge');

    const hitLeft = bro.decor.hitTest(geom, { x: geom.frameRect.x, y: 300 });
    assert(hitLeft.area === 'ResizeBorder' && hitLeft.edge === 'Left', 'hitTest Left edge');

    const hitRight = bro.decor.hitTest(geom, { x: geom.frameRect.x + geom.frameRect.width - 1, y: 300 });
    assert(hitRight.area === 'ResizeBorder' && hitRight.edge === 'Right', 'hitTest Right edge');

    const hitShadow = bro.decor.hitTest(geom, { x: geom.frameRect.x - 10, y: 300 });
    assert(hitShadow.area === 'Shadow' && hitShadow.isShadow === true, 'hitTest Shadow');

    const hitNone = bro.decor.hitTest(geom, { x: 0, y: 0 });
    assert(hitNone.area === 'None' && hitNone.buttonIndex === -1 && hitNone.buttonKind === null, 'hitTest None');

    // 4. Maximized / Fullscreen / Tiled / Custom metrics
    const maxGeom = bro.decor.computeGeometry({
        clientRect: { x: 0, y: 32, width: 1920, height: 1048 },
        state: 'maximized',
    });
    assert(maxGeom.state === 'maximized', 'maximized state');
    assert(maxGeom.frameRect.x === 0 && maxGeom.frameRect.y === 0 && maxGeom.frameRect.height === 1080, 'maximized zero borders');
    assert(maxGeom.buttons[1].kind === 'Restore', 'Maximize swaps to Restore when maximized');
    assert(maxGeom.shadowMargins.left === 0 && maxGeom.shadowMargins.bottom === 0, 'maximized zero shadow');
    const maxEdgeHit = bro.decor.hitTest(maxGeom, { x: 500, y: 5 });
    assert(maxEdgeHit.area === 'Caption' && maxEdgeHit.isResizable === false, 'maximized not resizable at top edge');

    const fsGeom = bro.decor.computeGeometry({
        clientRect: { x: 0, y: 0, width: 1920, height: 1080 },
        state: 'fullscreen',
    });
    assert(fsGeom.captionRect.height === 0 && fsGeom.buttons.length === 0, 'fullscreen has zero caption and no buttons');

    const tiledGeom = bro.decor.computeGeometry({
        clientRect: { x: 10, y: 40, width: 500, height: 500 },
        state: 'tiled_left',
        metrics: { captionHeight: 40, borderThickness: 6 },
    });
    assert(tiledGeom.state === 'tiled', 'tiled_left maps to tiled');
    assert(tiledGeom.frameRect.x === 9 && tiledGeom.frameRect.width === 502, 'tiled clamps border to 1px');
    assert(tiledGeom.captionRect.height === 40, 'custom captionHeight respected');

    console.log('test_decor.js PASSED');
}
