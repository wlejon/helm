// bro.ime — Input method compose sequences, dead keys, XKB keysym tables,
// candidate popup placement, and prefix dictionary trie.

(function () {
    'use strict';

    const mount = (root, name) => (root[name] !== undefined ? root[name] : (root[name] = {}));

    const KEYSYMS = {
        VoidSymbol: 0xFFFFFF,
        BackSpace: 0xFF08,
        Tab: 0xFF09,
        Return: 0xFF0D,
        Escape: 0xFF1B,
        Delete: 0xFFFF,
        Space: 0x0020,
        MultiKey: 0xFF20,
        Home: 0xFF50,
        Left: 0xFF51,
        Up: 0xFF52,
        Right: 0xFF53,
        Down: 0xFF54,
        PageUp: 0xFF55,
        PageDown: 0xFF56,
        End: 0xFF57,
        DeadGrave: 0xFE50,
        DeadAcute: 0xFE51,
        DeadCircumflex: 0xFE52,
        DeadTilde: 0xFE53,
        DeadMacron: 0xFE54,
        DeadBreve: 0xFE55,
        DeadAboveDot: 0xFE56,
        DeadDiaeresis: 0xFE57,
        DeadAboveRing: 0xFE58,
        DeadDoubleAcute: 0xFE59,
        DeadCaron: 0xFE5A,
        DeadCedilla: 0xFE5B,
        DeadOgonek: 0xFE5C,
        DeadIota: 0xFE5D,
        DeadVoicedSound: 0xFE5E,
        DeadSemivoicedSound: 0xFE5F,
        DeadBelowDot: 0xFE60,
        DeadHook: 0xFE61,
        DeadHorn: 0xFE62,
        DeadStroke: 0xFE63,
    };

    const NAMED_KEYSYMS = new Map([
        ['Multi_key', KEYSYMS.MultiKey],
        ['Compose', KEYSYMS.MultiKey],
        ['BackSpace', KEYSYMS.BackSpace],
        ['Tab', KEYSYMS.Tab],
        ['Return', KEYSYMS.Return],
        ['Enter', KEYSYMS.Return],
        ['Escape', KEYSYMS.Escape],
        ['Delete', KEYSYMS.Delete],
        ['space', KEYSYMS.Space],
        ['Home', KEYSYMS.Home],
        ['Left', KEYSYMS.Left],
        ['Up', KEYSYMS.Up],
        ['Right', KEYSYMS.Right],
        ['Down', KEYSYMS.Down],
        ['Prior', KEYSYMS.PageUp],
        ['Page_Up', KEYSYMS.PageUp],
        ['PageUp', KEYSYMS.PageUp],
        ['Next', KEYSYMS.PageDown],
        ['Page_Down', KEYSYMS.PageDown],
        ['PageDown', KEYSYMS.PageDown],
        ['End', KEYSYMS.End],

        ['dead_grave', KEYSYMS.DeadGrave],
        ['dead_acute', KEYSYMS.DeadAcute],
        ['dead_circumflex', KEYSYMS.DeadCircumflex],
        ['dead_tilde', KEYSYMS.DeadTilde],
        ['dead_macron', KEYSYMS.DeadMacron],
        ['dead_breve', KEYSYMS.DeadBreve],
        ['dead_abovedot', KEYSYMS.DeadAboveDot],
        ['dead_diaeresis', KEYSYMS.DeadDiaeresis],
        ['dead_abovering', KEYSYMS.DeadAboveRing],
        ['dead_doubleacute', KEYSYMS.DeadDoubleAcute],
        ['dead_caron', KEYSYMS.DeadCaron],
        ['dead_cedilla', KEYSYMS.DeadCedilla],
        ['dead_ogonek', KEYSYMS.DeadOgonek],
        ['dead_iota', KEYSYMS.DeadIota],
        ['dead_voiced_sound', KEYSYMS.DeadVoicedSound],
        ['dead_semivoiced_sound', KEYSYMS.DeadSemivoicedSound],
        ['dead_belowdot', KEYSYMS.DeadBelowDot],
        ['dead_hook', KEYSYMS.DeadHook],
        ['dead_horn', KEYSYMS.DeadHorn],
        ['dead_stroke', KEYSYMS.DeadStroke],

        ['DeadGrave', KEYSYMS.DeadGrave],
        ['DeadAcute', KEYSYMS.DeadAcute],
        ['DeadCircumflex', KEYSYMS.DeadCircumflex],
        ['DeadTilde', KEYSYMS.DeadTilde],
        ['DeadMacron', KEYSYMS.DeadMacron],
        ['DeadBreve', KEYSYMS.DeadBreve],
        ['DeadAboveDot', KEYSYMS.DeadAboveDot],
        ['DeadDiaeresis', KEYSYMS.DeadDiaeresis],
        ['DeadAboveRing', KEYSYMS.DeadAboveRing],
        ['DeadDoubleAcute', KEYSYMS.DeadDoubleAcute],
        ['DeadCaron', KEYSYMS.DeadCaron],
        ['DeadCedilla', KEYSYMS.DeadCedilla],
        ['DeadOgonek', KEYSYMS.DeadOgonek],
        ['DeadIota', KEYSYMS.DeadIota],
        ['DeadVoicedSound', KEYSYMS.DeadVoicedSound],
        ['DeadSemivoicedSound', KEYSYMS.DeadSemivoicedSound],
        ['DeadBelowDot', KEYSYMS.DeadBelowDot],
        ['DeadHook', KEYSYMS.DeadHook],
        ['DeadHorn', KEYSYMS.DeadHorn],
        ['DeadStroke', KEYSYMS.DeadStroke],

        ['exclam', 33],       // '!'
        ['quotedbl', 34],     // '"'
        ['numbersign', 35],   // '#'
        ['dollar', 36],       // '$'
        ['percent', 37],      // '%'
        ['ampersand', 38],    // '&'
        ['apostrophe', 39],   // '\''
        ['quoteright', 39],
        ['quoteleft', 96],    // '`'
        ['parenleft', 40],    // '('
        ['parenright', 41],   // ')'
        ['asterisk', 42],     // '*'
        ['plus', 43],         // '+'
        ['comma', 44],        // ','
        ['minus', 45],        // '-'
        ['period', 46],       // '.'
        ['slash', 47],        // '/'
        ['colon', 58],        // ':'
        ['semicolon', 59],    // ';'
        ['less', 60],         // '<'
        ['equal', 61],        // '='
        ['greater', 62],      // '>'
        ['question', 63],     // '?'
        ['at', 64],           // '@'
        ['bracketleft', 91],  // '['
        ['backslash', 92],    // '\\'
        ['bracketright', 93], // ']'
        ['asciicircum', 94],  // '^'
        ['underscore', 95],   // '_'
        ['grave', 96],        // '`'
        ['braceleft', 123],   // '{'
        ['bar', 124],         // '|'
        ['braceright', 125],  // '}'
        ['asciitilde', 126],  // '~'
        ['tilde', 126],
    ]);

    const NORMALIZED_KEYSYMS = new Map();
    for (const [k, v] of NAMED_KEYSYMS) {
        if (k.length === 1) continue;
        const norm = k.replace(/[_-]/g, '').toLowerCase();
        if (!NORMALIZED_KEYSYMS.has(norm)) NORMALIZED_KEYSYMS.set(norm, v);
    }

    const CANONICAL_NAMES = new Map([
        [KEYSYMS.MultiKey, 'Multi_key'],
        [KEYSYMS.BackSpace, 'BackSpace'],
        [KEYSYMS.Tab, 'Tab'],
        [KEYSYMS.Return, 'Return'],
        [KEYSYMS.Escape, 'Escape'],
        [KEYSYMS.Delete, 'Delete'],
        [KEYSYMS.Space, 'space'],
        [KEYSYMS.Home, 'Home'],
        [KEYSYMS.Left, 'Left'],
        [KEYSYMS.Up, 'Up'],
        [KEYSYMS.Right, 'Right'],
        [KEYSYMS.Down, 'Down'],
        [KEYSYMS.PageUp, 'Page_Up'],
        [KEYSYMS.PageDown, 'Page_Down'],
        [KEYSYMS.End, 'End'],

        [KEYSYMS.DeadGrave, 'dead_grave'],
        [KEYSYMS.DeadAcute, 'dead_acute'],
        [KEYSYMS.DeadCircumflex, 'dead_circumflex'],
        [KEYSYMS.DeadTilde, 'dead_tilde'],
        [KEYSYMS.DeadMacron, 'dead_macron'],
        [KEYSYMS.DeadBreve, 'dead_breve'],
        [KEYSYMS.DeadAboveDot, 'dead_abovedot'],
        [KEYSYMS.DeadDiaeresis, 'dead_diaeresis'],
        [KEYSYMS.DeadAboveRing, 'dead_abovering'],
        [KEYSYMS.DeadDoubleAcute, 'dead_doubleacute'],
        [KEYSYMS.DeadCaron, 'dead_caron'],
        [KEYSYMS.DeadCedilla, 'dead_cedilla'],
        [KEYSYMS.DeadOgonek, 'dead_ogonek'],
        [KEYSYMS.DeadIota, 'dead_iota'],
        [KEYSYMS.DeadVoicedSound, 'dead_voiced_sound'],
        [KEYSYMS.DeadSemivoicedSound, 'dead_semivoiced_sound'],
        [KEYSYMS.DeadBelowDot, 'dead_belowdot'],
        [KEYSYMS.DeadHook, 'dead_hook'],
        [KEYSYMS.DeadHorn, 'dead_horn'],
        [KEYSYMS.DeadStroke, 'dead_stroke'],

        [39, 'apostrophe'],
        [96, 'grave'],
        [126, 'asciitilde'],
        [94, 'asciicircum'],
        [34, 'quotedbl'],
        [33, 'exclam'],
        [35, 'numbersign'],
        [36, 'dollar'],
        [37, 'percent'],
        [38, 'ampersand'],
        [40, 'parenleft'],
        [41, 'parenright'],
        [42, 'asterisk'],
        [43, 'plus'],
        [44, 'comma'],
        [45, 'minus'],
        [46, 'period'],
        [47, 'slash'],
        [58, 'colon'],
        [59, 'semicolon'],
        [60, 'less'],
        [61, 'equal'],
        [62, 'greater'],
        [63, 'question'],
        [64, 'at'],
        [91, 'bracketleft'],
        [92, 'backslash'],
        [93, 'bracketright'],
        [95, 'underscore'],
        [123, 'braceleft'],
        [124, 'bar'],
        [125, 'braceright'],
    ]);

    function keysymFromNameOnly(name) {
        if (typeof name !== 'string' || name.length === 0) return KEYSYMS.VoidSymbol;
        const exact = NAMED_KEYSYMS.get(name);
        if (exact !== undefined) return exact;

        const norm = name.replace(/[_-]/g, '').toLowerCase();
        const normHit = NORMALIZED_KEYSYMS.get(norm);
        if (normHit !== undefined) return normHit;

        if (name.length === 1 && name.charCodeAt(0) <= 0xFF) {
            return name.charCodeAt(0);
        }

        if (name[0] === 'U' || name[0] === 'u') {
            const hexPart = name.length > 2 && name[1] === '+' ? name.slice(2) : name.slice(1);
            if (/^[0-9a-fA-F]+$/.test(hexPart)) {
                const cp = parseInt(hexPart, 16);
                if (cp >= 0x0100 && cp <= 0x10FFFF) return (0x01000000 | cp) >>> 0;
                return cp >>> 0;
            }
        }

        if (name.length > 2 && name[0] === '0' && (name[1] === 'x' || name[1] === 'X')) {
            const hexPart = name.slice(2);
            if (/^[0-9a-fA-F]+$/.test(hexPart)) {
                return parseInt(hexPart, 16) >>> 0;
            }
        }

        return KEYSYMS.VoidSymbol;
    }

    function keysymFromUtf8(str) {
        if (typeof str !== 'string' || str.length === 0) return KEYSYMS.VoidSymbol;
        const cp = str.codePointAt(0);
        if (!cp) return KEYSYMS.VoidSymbol;
        if (cp <= 0x00FF) return cp;
        return (0x01000000 | cp) >>> 0;
    }

    function keysymFromName(name) {
        if (typeof name !== 'string' || name.length === 0) return KEYSYMS.VoidSymbol;
        let sym = keysymFromNameOnly(name);
        if (sym === KEYSYMS.VoidSymbol) {
            sym = keysymFromUtf8(name);
        }
        return sym;
    }

    function keysymToName(sym) {
        if (typeof sym !== 'number' || !Number.isFinite(sym)) return '';
        const u = sym >>> 0;
        const canon = CANONICAL_NAMES.get(u);
        if (canon !== undefined) return canon;
        if (u >= 0x20 && u <= 0x7E) return String.fromCharCode(u);
        if ((u & 0xFF000000) === 0x01000000) {
            const hex = (u & 0x00FFFFFF).toString(16).toUpperCase().padStart(4, '0');
            return 'U' + hex;
        }
        return '0x' + u.toString(16).toUpperCase().padStart(4, '0');
    }

    function keysymToUtf8(sym) {
        if (typeof sym !== 'number' || !Number.isFinite(sym)) return '';
        const u = sym >>> 0;
        if (u >= 0x20 && u <= 0x7E) return String.fromCharCode(u);
        if (u >= 0x00A0 && u <= 0x00FF) return String.fromCodePoint(u);
        if ((u & 0xFF000000) === 0x01000000) {
            const cp = u & 0x00FFFFFF;
            if (cp <= 0x10FFFF) return String.fromCodePoint(cp);
        }
        return '';
    }

    // ---- Compose Engine ----
    const makeComposeNode = () => ({ children: new Map(), result: '', isTerminal: false });

    let composeRoot = makeComposeNode();
    let composeCurrent = composeRoot;
    let composeDepth = 0;

    function addComposeSeq(seq, output) {
        if (!seq.length || !output) return;
        let node = composeRoot;
        for (let i = 0; i < seq.length; ++i) {
            const sym = seq[i];
            let child = node.children.get(sym);
            if (!child) {
                child = makeComposeNode();
                node.children.set(sym, child);
            }
            node = child;
        }
        node.isTerminal = true;
        node.result = output;
    }

    function parseComposeSpec(spec) {
        const seq = [];
        let i = 0;
        const n = spec.length;
        while (i < n) {
            while (i < n && /\s/.test(spec[i])) ++i;
            if (i >= n) break;
            let token;
            if (spec[i] === '<') {
                const close = spec.indexOf('>', i);
                if (close < 0) break;
                token = spec.slice(i + 1, close);
                i = close + 1;
            } else {
                let end = i;
                while (end < n && !/\s/.test(spec[end])) ++end;
                token = spec.slice(i, end);
                i = end;
            }
            const sym = keysymFromNameOnly(token);
            if (sym !== KEYSYMS.VoidSymbol) seq.push(sym);
        }
        return seq;
    }

    function loadBuiltinRules() {
        const ch = (c) => c.charCodeAt(0);
        const addAccent = (deadSym, asciiChar, pairs, baseChar) => {
            const asciiSym = ch(asciiChar);
            for (let i = 0; i < pairs.length; ++i) {
                const l = ch(pairs[i][0]);
                const res = pairs[i][1];
                addComposeSeq([deadSym, l], res);
                addComposeSeq([KEYSYMS.MultiKey, asciiSym, l], res);
                addComposeSeq([asciiSym, l], res);
            }
            addComposeSeq([deadSym, asciiSym], baseChar);
            addComposeSeq([deadSym, KEYSYMS.Space], baseChar);
            addComposeSeq([deadSym, deadSym], baseChar);
            addComposeSeq([asciiSym, asciiSym], baseChar);
            addComposeSeq([asciiSym, KEYSYMS.Space], baseChar);
        };

        addAccent(KEYSYMS.DeadAcute, "'", [
            ['a', 'á'], ['e', 'é'], ['i', 'í'], ['o', 'ó'], ['u', 'ú'], ['y', 'ý'],
            ['c', 'ć'], ['n', 'ń'], ['s', 'ś'], ['z', 'ź'],
            ['A', 'Á'], ['E', 'É'], ['I', 'Í'], ['O', 'Ó'], ['U', 'Ú'], ['Y', 'Ý'],
            ['C', 'Ć'], ['N', 'Ń'], ['S', 'Ś'], ['Z', 'Ź'],
        ], "'");

        addAccent(KEYSYMS.DeadGrave, '`', [
            ['a', 'à'], ['e', 'è'], ['i', 'ì'], ['o', 'ò'], ['u', 'ù'],
            ['A', 'À'], ['E', 'È'], ['I', 'Ì'], ['O', 'Ò'], ['U', 'Ù'],
        ], '`');

        addAccent(KEYSYMS.DeadCircumflex, '^', [
            ['a', 'â'], ['e', 'ê'], ['i', 'î'], ['o', 'ô'], ['u', 'û'],
            ['c', 'ĉ'], ['g', 'ĝ'], ['h', 'ĥ'], ['j', 'ĵ'], ['s', 'ŝ'], ['w', 'ŵ'], ['y', 'ŷ'],
            ['A', 'Â'], ['E', 'Ê'], ['I', 'Î'], ['O', 'Ô'], ['U', 'Û'],
            ['C', 'Ĉ'], ['G', 'Ĝ'], ['H', 'Ĥ'], ['J', 'Ĵ'], ['S', 'Ŝ'], ['W', 'Ŵ'], ['Y', 'Ŷ'],
        ], '^');

        addAccent(KEYSYMS.DeadTilde, '~', [
            ['a', 'ã'], ['e', 'ẽ'], ['i', 'ĩ'], ['o', 'õ'], ['u', 'ũ'], ['n', 'ñ'],
            ['A', 'Ã'], ['E', 'Ẽ'], ['I', 'Ĩ'], ['O', 'Õ'], ['U', 'Ũ'], ['N', 'Ñ'],
        ], '~');

        addAccent(KEYSYMS.DeadDiaeresis, '"', [
            ['a', 'ä'], ['e', 'ë'], ['i', 'ï'], ['o', 'ö'], ['u', 'ü'], ['y', 'ÿ'],
            ['A', 'Ä'], ['E', 'Ë'], ['I', 'Ï'], ['O', 'Ö'], ['U', 'Ü'], ['Y', 'Ÿ'],
        ], '"');

        addAccent(KEYSYMS.DeadCedilla, ',', [
            ['c', 'ç'], ['s', 'ş'], ['t', 'ţ'],
            ['C', 'Ç'], ['S', 'Ş'], ['T', 'Ţ'],
        ], '¸');

        addComposeSeq([KEYSYMS.DeadAboveRing, ch('a')], 'å');
        addComposeSeq([KEYSYMS.DeadAboveRing, ch('u')], 'ů');
        addComposeSeq([KEYSYMS.DeadAboveRing, ch('A')], 'Å');
        addComposeSeq([KEYSYMS.DeadAboveRing, ch('U')], 'Ů');
        addComposeSeq([KEYSYMS.DeadAboveRing, KEYSYMS.Space], '°');
        addComposeSeq([KEYSYMS.DeadAboveRing, KEYSYMS.DeadAboveRing], '°');
        addComposeSeq([KEYSYMS.MultiKey, ch('o'), ch('a')], 'å');
        addComposeSeq([KEYSYMS.MultiKey, ch('o'), ch('A')], 'Å');

        const caron = [
            ['c', 'č'], ['d', 'ď'], ['e', 'ě'], ['l', 'ľ'], ['n', 'ň'],
            ['r', 'ř'], ['s', 'š'], ['t', 'ť'], ['z', 'ž'],
            ['C', 'Č'], ['D', 'Ď'], ['E', 'Ě'], ['L', 'Ľ'], ['N', 'Ň'],
            ['R', 'Ř'], ['S', 'Š'], ['T', 'Ť'], ['Z', 'Ž'],
        ];
        for (const [l, r] of caron) {
            addComposeSeq([KEYSYMS.DeadCaron, ch(l)], r);
            addComposeSeq([KEYSYMS.MultiKey, ch('v'), ch(l)], r);
            addComposeSeq([KEYSYMS.MultiKey, ch('c'), ch(l)], r);
        }

        const macron = [
            ['a', 'ā'], ['e', 'ē'], ['i', 'ī'], ['o', 'ō'], ['u', 'ū'],
            ['A', 'Ā'], ['E', 'Ē'], ['I', 'Ī'], ['O', 'Ō'], ['U', 'Ū'],
        ];
        for (const [l, r] of macron) {
            addComposeSeq([KEYSYMS.DeadMacron, ch(l)], r);
            addComposeSeq([KEYSYMS.MultiKey, ch('_'), ch(l)], r);
            addComposeSeq([KEYSYMS.MultiKey, ch('-'), ch(l)], r);
        }

        const ogonek = [
            ['a', 'ą'], ['e', 'ę'], ['i', 'į'], ['u', 'ų'],
            ['A', 'Ą'], ['E', 'Ę'], ['I', 'Į'], ['U', 'Ų'],
        ];
        for (const [l, r] of ogonek) {
            addComposeSeq([KEYSYMS.DeadOgonek, ch(l)], r);
        }

        const stroke = [
            ['d', 'đ'], ['h', 'ħ'], ['l', 'ł'], ['o', 'ø'], ['t', 'ŧ'],
            ['D', 'Đ'], ['H', 'Ħ'], ['L', 'Ł'], ['O', 'Ø'], ['T', 'Ŧ'],
        ];
        for (const [l, r] of stroke) {
            addComposeSeq([KEYSYMS.DeadStroke, ch(l)], r);
            addComposeSeq([KEYSYMS.MultiKey, ch('/'), ch(l)], r);
        }

        const multi = [
            ['c', 'o', '©'], ['C', 'O', '©'], ['o', 'c', '©'], ['O', 'C', '©'],
            ['r', 'o', '®'], ['R', 'O', '®'], ['o', 'r', '®'], ['O', 'R', '®'],
            ['t', 'm', '™'], ['T', 'M', '™'],
            ['s', 's', 'ß'], ['a', 'e', 'æ'], ['A', 'E', 'Æ'], ['o', 'e', 'œ'], ['O', 'E', 'Œ'],
            ['c', '/', '¢'], ['/', 'c', '¢'], ['y', '=', '¥'], ['=', 'y', '¥'],
            ['e', '=', '€'], ['=', 'e', '€'], ['l', '-', '£'], ['-', 'l', '£'],
            ['<', '<', '«'], ['>', '>', '»'], ['!', '!', '¡'], ['?', '?', '¿'],
            ['-', '>', '→'], ['<', '-', '←'], ['=', '>', '⇒'], ['<', '=', '⇐'],
            ['.', '.', '…'], ['-', '-', '–'],
            ['x', 'x', '×'], [':', '-', '÷'],
            ['1', '2', '½'], ['1', '4', '¼'], ['3', '4', '¾'],
            ['0', '^', '°'], ['+', '-', '±'], ['m', 'u', 'µ'], ['s', 'o', '§'],
            ['p', '!', '¶'], ['<', '3', '♥'],
        ];
        for (const [a, b, r] of multi) {
            addComposeSeq([KEYSYMS.MultiKey, ch(a), ch(b)], r);
        }
        addComposeSeq([KEYSYMS.MultiKey, ch('-'), ch('-'), ch('-')], '—');
    }

    loadBuiltinRules();

    function resetCompose() {
        composeCurrent = composeRoot;
        composeDepth = 0;
    }

    function stepCompose(sym) {
        let next = composeCurrent.children.get(sym);
        if (!next) {
            if (composeCurrent !== composeRoot) {
                resetCompose();
                const rootNext = composeRoot.children.get(sym);
                if (rootNext) {
                    composeCurrent = rootNext;
                    composeDepth = 1;
                    if (composeCurrent.isTerminal) {
                        const text = composeCurrent.result;
                        resetCompose();
                        return { status: 'matched', text };
                    }
                    return { status: 'pending', text: '' };
                }
            }
            resetCompose();
            return { status: 'none', text: '' };
        }
        composeCurrent = next;
        composeDepth++;
        if (composeCurrent.isTerminal) {
            const text = composeCurrent.result;
            resetCompose();
            return { status: 'matched', text };
        }
        return { status: 'pending', text: '' };
    }

    function feedKey(keyNameOrSym) {
        let sym = KEYSYMS.VoidSymbol;
        if (typeof keyNameOrSym === 'number') {
            sym = keyNameOrSym >>> 0;
        } else if (typeof keyNameOrSym === 'string') {
            sym = keysymFromName(keyNameOrSym);
        }
        if (sym === KEYSYMS.VoidSymbol) return { status: 'none', text: '' };
        return stepCompose(sym);
    }

    function isComposing() {
        return composeCurrent !== composeRoot && composeDepth > 0;
    }

    function addRule(spec, output) {
        if (typeof spec !== 'string' || !spec || typeof output !== 'string' || !output) return false;
        const seq = parseComposeSpec(spec);
        if (!seq.length) return false;
        addComposeSeq(seq, output);
        return true;
    }

    function clearRules() {
        composeRoot = makeComposeNode();
        resetCompose();
    }

    // ---- Popup Placement ----
    function readAnchorRect(v) {
        if (!v || typeof v !== 'object') return { x: 0, y: 0, width: 0, height: 0 };
        const x = typeof v.x === 'number' ? v.x : (typeof v.left === 'number' ? v.left : 0);
        const y = typeof v.y === 'number' ? v.y : (typeof v.top === 'number' ? v.top : 0);
        const width = typeof v.width === 'number' ? v.width : (typeof v.w === 'number' ? v.w : 0);
        const height = typeof v.height === 'number' ? v.height : (typeof v.h === 'number' ? v.h : 0);
        return { x: x | 0, y: y | 0, width: width | 0, height: height | 0 };
    }

    function computePopupPlacement(cursorRectIn, popupWidthIn, popupHeightIn, displayBoundsIn, marginIn) {
        const cursor = readAnchorRect(cursorRectIn);
        const bounds = readAnchorRect(displayBoundsIn);
        const popupW = typeof popupWidthIn === 'number' ? (popupWidthIn | 0) : 0;
        const popupH = typeof popupHeightIn === 'number' ? (popupHeightIn | 0) : 0;
        const margin = typeof marginIn === 'number' ? (marginIn | 0) : 4;

        const cursorBottom = cursor.y + cursor.height;
        const boundsRight = bounds.x + bounds.width;
        const boundsBottom = bounds.y + bounds.height;

        const yBelow = cursorBottom + margin;
        const yAbove = cursor.y - margin - popupH;

        const fitsBelow = yBelow + popupH <= boundsBottom;
        const fitsAbove = yAbove >= bounds.y;

        let flippedY = false;
        let y;
        if (fitsBelow) {
            y = yBelow;
        } else if (fitsAbove) {
            flippedY = true;
            y = yAbove;
        } else {
            const spaceBelow = boundsBottom - yBelow;
            const spaceAbove = cursor.y - margin - bounds.y;
            if (spaceBelow >= spaceAbove) {
                y = yBelow;
                if (y + popupH > boundsBottom) y = boundsBottom - popupH;
            } else {
                flippedY = true;
                y = yAbove;
                if (y < bounds.y) y = bounds.y;
            }
        }
        if (y < bounds.y) y = bounds.y;

        let x = cursor.x;
        if (x + popupW > boundsRight) x = boundsRight - popupW;
        if (x < bounds.x) x = bounds.x;

        return { x, y, width: popupW, height: popupH, flippedY };
    }

    // ---- Prefix Dictionary Trie ----
    const makeTrieNode = () => ({ children: new Map(), isWord: false, score: 0, word: '', annotation: '' });
    const dictRoot = makeTrieNode();

    function insertWord(word, score, annotation) {
        if (typeof word !== 'string' || word.length === 0) return false;
        const sc = typeof score === 'number' ? (score | 0) : 0;
        const ann = typeof annotation === 'string' ? annotation : '';
        let cur = dictRoot;
        for (let i = 0; i < word.length; ++i) {
            const ch = word[i];
            let next = cur.children.get(ch);
            if (!next) {
                next = makeTrieNode();
                cur.children.set(ch, next);
            }
            cur = next;
        }
        cur.isWord = true;
        cur.score = sc;
        cur.word = word;
        cur.annotation = ann;
        return true;
    }

    function collectWords(node, out) {
        if (!node) return;
        if (node.isWord) out.push({ text: node.word, score: node.score });
        for (const child of node.children.values()) collectWords(child, out);
    }

    function findPrefixSuggestions(prefixIn, maxResultsIn) {
        const prefix = typeof prefixIn === 'string' ? prefixIn : '';
        let maxResults = 20;
        if (typeof maxResultsIn === 'number' && maxResultsIn >= 0) maxResults = maxResultsIn | 0;
        if (maxResults === 0) return [];

        let cur = dictRoot;
        for (let i = 0; i < prefix.length; ++i) {
            cur = cur.children.get(prefix[i]);
            if (!cur) return [];
        }

        const results = [];
        collectWords(cur, results);
        results.sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            if (a.text.length !== b.text.length) return a.text.length - b.text.length;
            return a.text < b.text ? -1 : (a.text > b.text ? 1 : 0);
        });
        if (results.length > maxResults) results.length = maxResults;
        return results.map((r) => r.text);
    }

    const ns = mount(globalThis.bro, 'ime');
    ns.feedKey = feedKey;
    ns.reset = resetCompose;
    ns.isComposing = isComposing;
    ns.keysymFromName = keysymFromName;
    ns.keysymToName = keysymToName;
    ns.keysymToUtf8 = keysymToUtf8;
    ns.keysymFromUtf8 = keysymFromUtf8;
    ns.computePopupPlacement = computePopupPlacement;
    ns.findPrefixSuggestions = findPrefixSuggestions;
    ns.insertWord = insertWord;
    ns.addRule = addRule;
    ns.clearRules = clearRules;
})();
