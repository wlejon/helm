// Headless test for bro.keys
assert(typeof bro.keys === 'object', 'bro.keys namespace exists');
if (!bro.keys.available) {
    skipTest('bro.keys is compiled out of this build');
} else {
    // 1. Static chord parsing and formatting
    const chord = bro.keys.parseChord('Ctrl+Shift+P');
    assert(chord && chord.key === 'P', 'parseChord extracts key P');
    assert(chord.ctrl === true && chord.shift === true && chord.alt === false, 'parseChord extracts modifiers');

    const formatted = bro.keys.formatChord(chord);
    assert(formatted === 'Ctrl+Shift+P', 'formatChord produces canonical representation');

    const seq = bro.keys.parseSequence('Ctrl+K Ctrl+S');
    assert(Array.isArray(seq) && seq.length === 2, 'parseSequence produces 2 chords');
    assert(bro.keys.formatSequence(seq) === 'Ctrl+K Ctrl+S', 'formatSequence roundtrips');

    // 2. Validate when expressions
    assert(bro.keys.validateWhen('editorTextFocus && !editorReadonly') === true, 'valid when expression passes');
    assert(bro.keys.validateWhen('lineCount > 10') === true, 'numeric when comparison passes');
    assert(bro.keys.validateWhen("resourceFilename =~ /\\.ts$/i") === true, 'regex when expression passes');
    assert(bro.keys.validateWhen('((unclosedParen') === false, 'invalid when syntax rejected');
    assert(bro.keys.validateWhen('a =~ /[invalid/') === false, 'invalid regex in when rejected');

    // 3. Engine creation and bindings
    const engine = new bro.keys.Engine();
    assert(typeof engine === 'object', 'Engine instantiated');

    engine.addBinding({
        key: 'Ctrl+Shift+P',
        command: 'command.palette',
        when: '!terminalFocus'
    });

    engine.addBinding({
        key: 'Ctrl+K Ctrl+S',
        command: 'keyboard.shortcuts'
    });

    engine.addBinding({
        key: 'Ctrl+R',
        command: 'regex.action',
        when: "fileName =~ /\\.js$/ && lineCount >= 10 && 'foo' in tags",
        args: { mode: 'fast' }
    });

    // Set context (key, val) and object forms
    engine.setContext('terminalFocus', false);
    assert(engine.getContext('terminalFocus') === false, 'getContext returns boolean false');
    engine.setContext({ fileName: 'app.js', lineCount: 15, tags: 'alpha foo bar' });
    assert(engine.getContext('lineCount') === 15, 'setContext object form works');

    const keydown = (key, code, ctrlKey, shiftKey) => ({
        key, code, ctrlKey, shiftKey, altKey: false, metaKey: false, type: 'keydown'
    });

    // Feed matching key event
    const matchResult = engine.feed(keydown('P', 'KeyP', true, true));
    assert(matchResult.type === 'match', 'feed produces match result');
    assert(matchResult.command === 'command.palette', 'command matches');

    const regexResult = engine.feed(keydown('r', 'KeyR', true, false));
    assert(regexResult.type === 'match' && regexResult.command === 'regex.action' && regexResult.args.mode === 'fast',
        'regex + numeric + in when-clause and args matched');

    // Feed multi-chord sequence
    const chord1Result = engine.feed(keydown('k', 'KeyK', true, false));
    assert(chord1Result.type === 'pending', 'first chord enters pending state');
    assert(engine.isPendingChord() === true, 'engine reports pending chord');
    assert(engine.getPendingSequence() === 'Ctrl+K', 'pending sequence string matches');

    const chord2Result = engine.feed(keydown('s', 'KeyS', true, false));
    assert(chord2Result.type === 'match', 'second chord completes match');
    assert(chord2Result.command === 'keyboard.shortcuts', 'multi-chord command matches');
    assert(engine.isPendingChord() === false, 'engine no longer pending');

    // Escape cancels pending chord
    assert(engine.feed(keydown('k', 'KeyK', true, false)).type === 'pending', 're-enter pending chord');
    const escCancel = engine.feed(keydown('Escape', 'Escape', false, false));
    assert(escCancel.type === 'cancelled' && escCancel.reason === 'escape', 'Escape cancels pending chord');
    assert(engine.isPendingChord() === false, 'not pending after Escape');

    // Reset + removeContext
    assert(engine.feed(keydown('k', 'KeyK', true, false)).type === 'pending', 're-enter pending chord');
    engine.reset();
    assert(engine.isPendingChord() === false, 'reset clears pending chord');
    assert(engine.removeContext('lineCount') === true && engine.getContext('lineCount') === undefined, 'removeContext works');

    // Unhandled key
    const unhandled = engine.feed(keydown('z', 'KeyZ', false, false));
    assert(unhandled.type === 'unhandled', 'unbound key reports unhandled');

    // JSON load (including comments and -command removal) + exportJson
    engine.loadJson(`[
        // comment
        {
            "key": "ctrl+b",
            "command": "workbench.action.toggleSidebar"
        },
        {
            "key": "Ctrl+Shift+P",
            "command": "-command.palette"
        }
    ]`);

    const sidebarResult = engine.feed(keydown('b', 'KeyB', true, false));
    assert(sidebarResult.type === 'match' && sidebarResult.command === 'workbench.action.toggleSidebar', 'json binding matched');
    assert(engine.feed(keydown('P', 'KeyP', true, true)).type === 'unhandled', '-command removed binding');

    const exported = JSON.parse(engine.exportJson(true));
    assert(Array.isArray(exported) && exported.some((b) => b.command === 'workbench.action.toggleSidebar'), 'exportJson includes binding');

    // Layout-aware engine (azerty)
    const azerty = new bro.keys.Engine({ layout: 'azerty' });
    azerty.addBinding({ key: 'Ctrl+A', command: 'selectAll' });
    const azRes = azerty.feed({ code: 'KeyQ', ctrlKey: true, type: 'keydown' });
    assert(azRes.type === 'match' && azRes.command === 'selectAll', 'azerty KeyQ maps to A');

    console.log('test_keys.js PASSED');
}
