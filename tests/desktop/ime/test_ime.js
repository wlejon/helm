// Headless test for bro.ime
assert(typeof bro.ime === 'object', 'bro.ime namespace exists');
if (!bro.ime.available) {
    skipTest('bro.ime is compiled out of this build');
} else {
    // 1. Keysym conversion
    assert(bro.ime.keysymFromName('DeadAcute') === 0xFE51, 'DeadAcute keysym');
    assert(bro.ime.keysymFromName('dead_acute') === 0xFE51, 'dead_acute keysym');
    assert(bro.ime.keysymFromName('Multi_key') === 0xFF20, 'Multi_key keysym');
    assert(bro.ime.keysymFromName('Return') === 0xFF0D, 'Return keysym');
    assert(bro.ime.keysymFromName('U+00E9') === 0xE9, 'U+00E9 Latin-1 keysym');
    assert(bro.ime.keysymFromName('U20AC') === 0x010020AC, 'U20AC Unicode keysym');
    assert(bro.ime.keysymFromName('0xFF20') === 0xFF20, 'hex keysym');
    assert(bro.ime.keysymToName(0xFE51) === 'dead_acute', 'keysymToName dead_acute');
    assert(bro.ime.keysymToName(0x010020AC) === 'U20AC', 'keysymToName Unicode');
    assert(bro.ime.keysymToUtf8(0x61) === 'a', 'keysymToUtf8 ASCII');
    assert(bro.ime.keysymToUtf8(0x010020AC) === '€', 'keysymToUtf8 Euro');
    assert(bro.ime.keysymFromUtf8('é') === 0xE9, 'keysymFromUtf8 Latin-1');
    assert(bro.ime.keysymFromUtf8('€') === 0x010020AC, 'keysymFromUtf8 Euro');

    // 2. Compose sequence state machine
    bro.ime.reset();
    assert(bro.ime.isComposing() === false, 'not composing initially');
    const r1 = bro.ime.feedKey('DeadAcute');
    assert(r1.status === 'pending' && r1.text === '' && bro.ime.isComposing() === true, 'DeadAcute enters pending');
    const r2 = bro.ime.feedKey('e');
    assert(r2.status === 'matched' && r2.text === 'é' && bro.ime.isComposing() === false, 'DeadAcute + e => é');

    assert(bro.ime.feedKey('Multi_key').status === 'pending', 'Multi_key pending');
    assert(bro.ime.feedKey('c').status === 'pending', 'Multi_key + c pending');
    const rCopy = bro.ime.feedKey('o');
    assert(rCopy.status === 'matched' && rCopy.text === '©', 'Multi_key + c + o => ©');

    // Broken sequence that restarts with a valid prefix
    assert(bro.ime.feedKey('DeadAcute').status === 'pending', 'start DeadAcute');
    assert(bro.ime.feedKey('DeadGrave').status === 'pending', 'broken sequence restarts on DeadGrave');
    assert(bro.ime.feedKey('a').text === 'à', 'DeadGrave + a => à');

    // Reset mid-sequence
    assert(bro.ime.feedKey('Multi_key').status === 'pending', 'Multi_key pending before reset');
    bro.ime.reset();
    assert(bro.ime.isComposing() === false, 'reset clears composition');

    // Custom rule + clearRules
    assert(bro.ime.addRule('<Multi_key> <q> <q>', 'QQQ') === true, 'addRule returns true');
    assert(bro.ime.feedKey('Multi_key').status === 'pending', 'custom rule step 1');
    assert(bro.ime.feedKey('q').status === 'pending', 'custom rule step 2');
    assert(bro.ime.feedKey('q').text === 'QQQ', 'custom rule matched');

    bro.ime.clearRules();
    assert(bro.ime.feedKey('DeadAcute').status === 'none', 'clearRules clears built-in rules');
    assert(bro.ime.addRule('<Multi_key> <a> <b>', 'AB') === true, 'addRule after clearRules');
    bro.ime.feedKey('Multi_key');
    bro.ime.feedKey('a');
    assert(bro.ime.feedKey('b').text === 'AB', 'custom rule works after clearRules');

    // 3. Popup placement
    const bounds = { x: 0, y: 0, width: 1000, height: 600 };
    const pBelow = bro.ime.computePopupPlacement({ x: 100, y: 100, width: 10, height: 20 }, 200, 100, bounds, 4);
    assert(pBelow.x === 100 && pBelow.y === 124 && pBelow.flippedY === false, 'popup placed below cursor');

    const pFlip = bro.ime.computePopupPlacement({ left: 900, top: 550, w: 10, h: 20 }, 200, 100, bounds, 4);
    assert(pFlip.x === 800 && pFlip.y === 446 && pFlip.flippedY === true, 'popup flips above and clamps x');

    // 4. Dictionary trie
    assert(bro.ime.insertWord('apple', 10, 'fruit') === true, 'insert apple');
    assert(bro.ime.insertWord('application', 50, 'app') === true, 'insert application');
    assert(bro.ime.insertWord('app', 50, 'short') === true, 'insert app');
    assert(bro.ime.insertWord('banana', 100, 'fruit') === true, 'insert banana');

    const sug = bro.ime.findPrefixSuggestions('app', 10);
    assert(sug.length === 3 && sug[0] === 'app' && sug[1] === 'application' && sug[2] === 'apple',
        'suggestions sorted by score desc then length asc: ' + JSON.stringify(sug));
    const sugLimit = bro.ime.findPrefixSuggestions('app', 2);
    assert(sugLimit.length === 2, 'maxResults respected');

    console.log('test_ime.js PASSED');
}
