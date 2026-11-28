// bro.keys — Keybinding dispatch engine, chords/sequences, VS Code when-clause
// evaluator, layout-aware matching, and keybindings.json import/export.

(function () {
    'use strict';

    const mount = (root, name) => (root[name] !== undefined ? root[name] : (root[name] = {}));

    const hostPlatform = () => {
        const p = globalThis.process && globalThis.process.platform;
        if (p === 'win32') return 'win';
        if (p === 'darwin') return 'mac';
        if (p === 'linux') return 'linux';
        return 'linux';
    };

    // ---- KeyCode mappings (matching brokeys/src/types.cpp) ----
    const CODE_TO_STR = {
        Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Space: 'Space',
        Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
        ArrowUp: 'UpArrow', ArrowDown: 'DownArrow', ArrowLeft: 'LeftArrow', ArrowRight: 'RightArrow',
        UpArrow: 'UpArrow', DownArrow: 'DownArrow', LeftArrow: 'LeftArrow', RightArrow: 'RightArrow',
        BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
        Backquote: '`', Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=',
        CapsLock: 'CapsLock', ScrollLock: 'ScrollLock', NumLock: 'NumLock',
        PrintScreen: 'PrintScreen', Pause: 'Pause', ContextMenu: 'ContextMenu',
        Numpad0: 'Numpad0', Numpad1: 'Numpad1', Numpad2: 'Numpad2', Numpad3: 'Numpad3', Numpad4: 'Numpad4',
        Numpad5: 'Numpad5', Numpad6: 'Numpad6', Numpad7: 'Numpad7', Numpad8: 'Numpad8', Numpad9: 'Numpad9',
        NumpadAdd: 'NumpadAdd', NumpadSubtract: 'NumpadSubtract', NumpadMultiply: 'NumpadMultiply',
        NumpadDivide: 'NumpadDivide', NumpadDecimal: 'NumpadDecimal', NumpadEnter: 'NumpadEnter', NumpadEqual: 'NumpadEqual',
        ControlLeft: 'ControlLeft', ControlRight: 'ControlRight', ShiftLeft: 'ShiftLeft', ShiftRight: 'ShiftRight',
        AltLeft: 'AltLeft', AltRight: 'AltRight', SuperLeft: 'SuperLeft', SuperRight: 'SuperRight',
    };

    const SINGLE_CHAR_TO_CODE = {
        '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote',
        '`': 'Backquote', ',': 'Comma', '.': 'Period', '/': 'Slash', '-': 'Minus', '=': 'Equal', ' ': 'Space',
    };

    const KEY_ALIASES = {
        escape: 'Escape', esc: 'Escape', enter: 'Enter', return: 'Enter', tab: 'Tab',
        backspace: 'Backspace', space: 'Space', spacebar: 'Space', insert: 'Insert', ins: 'Insert',
        delete: 'Delete', del: 'Delete', home: 'Home', end: 'End',
        pageup: 'PageUp', pgup: 'PageUp', pagedown: 'PageDown', pgdn: 'PageDown',
        up: 'ArrowUp', arrowup: 'ArrowUp', uparrow: 'ArrowUp',
        down: 'ArrowDown', arrowdown: 'ArrowDown', downarrow: 'ArrowDown',
        left: 'ArrowLeft', arrowleft: 'ArrowLeft', leftarrow: 'ArrowLeft',
        right: 'ArrowRight', arrowright: 'ArrowRight', rightarrow: 'ArrowRight',
        bracketleft: 'BracketLeft', bracketright: 'BracketRight', backslash: 'Backslash',
        semicolon: 'Semicolon', quote: 'Quote', backquote: 'Backquote', comma: 'Comma',
        period: 'Period', slash: 'Slash', minus: 'Minus', equal: 'Equal',
        capslock: 'CapsLock', scrolllock: 'ScrollLock', numlock: 'NumLock',
        printscreen: 'PrintScreen', prtsc: 'PrintScreen', pause: 'Pause', break: 'Pause',
        contextmenu: 'ContextMenu', menu: 'ContextMenu',
        numpad0: 'Numpad0', numpad1: 'Numpad1', numpad2: 'Numpad2', numpad3: 'Numpad3', numpad4: 'Numpad4',
        numpad5: 'Numpad5', numpad6: 'Numpad6', numpad7: 'Numpad7', numpad8: 'Numpad8', numpad9: 'Numpad9',
        numpadadd: 'NumpadAdd', numpadplus: 'NumpadAdd', numpadsubtract: 'NumpadSubtract', numpadminus: 'NumpadSubtract',
        numpadmultiply: 'NumpadMultiply', numpaddivide: 'NumpadDivide',
        numpaddecimal: 'NumpadDecimal', numpaddot: 'NumpadDecimal',
        numpadenter: 'NumpadEnter', numpadequal: 'NumpadEqual',
        controlleft: 'ControlLeft', controlright: 'ControlRight', shiftleft: 'ShiftLeft', shiftright: 'ShiftRight',
        altleft: 'AltLeft', altright: 'AltRight', superleft: 'SuperLeft', superright: 'SuperRight',
    };

    const MODIFIER_CODES = new Set([
        'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
        'AltLeft', 'AltRight', 'SuperLeft', 'SuperRight',
    ]);

    function keyCodeFromString(name) {
        if (!name || typeof name !== 'string') return '';
        const s = name.toLowerCase();
        if (s.length === 1) {
            const c = s.charCodeAt(0);
            if (c >= 97 && c <= 122) return 'Key' + s.toUpperCase();
            if (c >= 48 && c <= 57) return 'Digit' + s;
            if (SINGLE_CHAR_TO_CODE[s]) return SINGLE_CHAR_TO_CODE[s];
        }
        if (s.startsWith('key') && s.length === 4 && s[3] >= 'a' && s[3] <= 'z') {
            return 'Key' + s[3].toUpperCase();
        }
        if (s.startsWith('digit') && s.length === 6 && s[5] >= '0' && s[5] <= '9') {
            return 'Digit' + s[5];
        }
        if (s[0] === 'f' && s.length >= 2 && s.length <= 3 && /^\d+$/.test(s.slice(1))) {
            const n = parseInt(s.slice(1), 10);
            if (n >= 1 && n <= 24) return 'F' + n;
        }
        return KEY_ALIASES[s] || '';
    }

    function keyCodeToString(code) {
        if (!code) return 'Unknown';
        if (code.startsWith('Key') && code.length === 4) return code;
        if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
        if (/^F\d+$/.test(code)) return code;
        return CODE_TO_STR[code] || 'Unknown';
    }

    function chordKeyName(chord) {
        if (chord.code) {
            let n = keyCodeToString(chord.code);
            if (n.startsWith('Key') && n.length === 4) n = n.slice(3);
            return n;
        }
        return chord.character || '';
    }

    function formatChordInternal(chord, platform) {
        const p = platform || hostPlatform();
        let res = '';
        if (chord.ctrl) res += 'Ctrl+';
        if (chord.shift) res += 'Shift+';
        if (chord.alt) res += p === 'mac' ? 'Option+' : 'Alt+';
        if (chord.meta) res += p === 'mac' ? 'Cmd+' : (p === 'win' ? 'Win+' : 'Super+');
        if (chord.code) {
            let n = keyCodeToString(chord.code);
            if (n.startsWith('Key') && n.length === 4) n = n.slice(3);
            res += n;
        } else if (chord.character) {
            res += chord.character;
        }
        return res;
    }

    function splitChordTokens(str) {
        const tokens = [];
        let start = 0;
        for (let i = 0; i < str.length; ++i) {
            const c = str[i];
            if (c === '+' || c === '-') {
                if (i > 0 && i + 1 === str.length && (str[i - 1] === '+' || str[i - 1] === '-')) {
                    continue;
                }
                if (i > start) tokens.push(str.slice(start, i));
                start = i + 1;
            }
        }
        if (start < str.length) tokens.push(str.slice(start));
        return tokens;
    }

    function parseChordInternal(str) {
        const trimmed = String(str).trim();
        if (!trimmed) return null;
        const tokens = splitChordTokens(trimmed);
        if (!tokens.length) return null;

        let ctrl = false, shift = false, alt = false, meta = false;
        let keyPart = '';

        for (let i = 0; i < tokens.length; ++i) {
            const lower = tokens[i].toLowerCase();
            if (lower === 'ctrl' || lower === 'control') ctrl = true;
            else if (lower === 'shift') shift = true;
            else if (lower === 'alt' || lower === 'option' || lower === 'opt') alt = true;
            else if (lower === 'cmd' || lower === 'command' || lower === 'win' || lower === 'windows' || lower === 'super' || lower === 'meta') meta = true;
            else {
                if (i !== tokens.length - 1) return null;
                keyPart = tokens[i];
            }
        }

        if (!keyPart) return { ctrl, shift, alt, meta, code: '', character: '' };
        const code = keyCodeFromString(keyPart);
        const character = (keyPart.length === 1 || !code) ? keyPart : '';
        return { ctrl, shift, alt, meta, code, character };
    }

    function chordToJsObj(chord) {
        const modifiers = [];
        if (chord.ctrl) modifiers.push('ctrl');
        if (chord.shift) modifiers.push('shift');
        if (chord.alt) modifiers.push('alt');
        if (chord.meta) modifiers.push('meta');
        return {
            key: chordKeyName(chord),
            modifiers,
            ctrl: chord.ctrl,
            shift: chord.shift,
            alt: chord.alt,
            meta: chord.meta,
        };
    }

    function jsObjToChord(obj) {
        if (!obj || typeof obj !== 'object') return { ctrl: false, shift: false, alt: false, meta: false, code: '', character: '' };
        let keyStr = '';
        if (typeof obj.key === 'string') keyStr = obj.key;
        else if (typeof obj.code === 'string') keyStr = obj.code;
        else if (typeof obj.character === 'string') keyStr = obj.character;

        let ctrl = false, shift = false, alt = false, meta = false;
        const mObj = obj.modifiers !== undefined ? obj.modifiers : obj.mods;
        if (Array.isArray(mObj)) {
            for (const item of mObj) {
                if (typeof item !== 'string') continue;
                const m = item.toLowerCase();
                if (m === 'ctrl' || m === 'control') ctrl = true;
                else if (m === 'shift') shift = true;
                else if (m === 'alt' || m === 'option' || m === 'opt') alt = true;
                else if (m === 'meta' || m === 'cmd' || m === 'command' || m === 'super' || m === 'win') meta = true;
            }
        } else if (mObj && typeof mObj === 'object') {
            if (mObj.ctrl || mObj.control) ctrl = true;
            if (mObj.shift) shift = true;
            if (mObj.alt) alt = true;
            if (mObj.meta || mObj.super || mObj.cmd) meta = true;
        }
        if (obj.ctrl || obj.ctrlKey) ctrl = true;
        if (obj.shift || obj.shiftKey) shift = true;
        if (obj.alt || obj.altKey) alt = true;
        if (obj.meta || obj.metaKey || obj.super || obj.superKey) meta = true;

        const code = keyCodeFromString(keyStr);
        const character = (keyStr.length === 1 || !code) ? keyStr : '';
        return { ctrl, shift, alt, meta, code, character };
    }

    function chordsEqual(a, b) {
        if (a.ctrl !== b.ctrl || a.shift !== b.shift || a.alt !== b.alt || a.meta !== b.meta) return false;
        if (a.code && b.code && a.code === b.code) return true;
        if (a.character && b.character && a.character.toLowerCase() === b.character.toLowerCase()) return true;
        if (a.code && b.character) {
            let s = keyCodeToString(a.code).toLowerCase();
            if (s.startsWith('key') && s.length === 4) s = s.slice(3);
            if (s === b.character.toLowerCase()) return true;
        }
        if (b.code && a.character) {
            let s = keyCodeToString(b.code).toLowerCase();
            if (s.startsWith('key') && s.length === 4) s = s.slice(3);
            if (s === a.character.toLowerCase()) return true;
        }
        return a.code === b.code && a.character === b.character;
    }

    function parseSequenceInternal(str) {
        if (typeof str !== 'string') return null;
        const trimmed = str.trim();
        if (!trimmed) return null;
        const parts = trimmed.split(/\s+/);
        const chords = [];
        for (const p of parts) {
            const c = parseChordInternal(p);
            if (!c) return null;
            chords.push(c);
        }
        return chords.length ? chords : null;
    }

    function sequencesEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; ++i) {
            if (!chordsEqual(a[i], b[i])) return false;
        }
        return true;
    }

    function isProperPrefixOf(prefix, full) {
        if (prefix.length >= full.length) return false;
        for (let i = 0; i < prefix.length; ++i) {
            if (!chordsEqual(prefix[i], full[i])) return false;
        }
        return true;
    }

    function formatSequenceInternal(chords, platform) {
        return chords.map((c) => formatChordInternal(c, platform)).join(' ');
    }

    // ---- Layouts (matching brokeys/src/layout.cpp) ----
    function makeLayout(name) {
        const keyToText = new Map();
        const textToKey = new Map();
        const mapKey = (code, unshifted, shifted) => {
            keyToText.set(code, { unshifted, shifted });
            if (unshifted) textToKey.set(unshifted.toLowerCase(), code);
            if (shifted) textToKey.set(shifted.toLowerCase(), code);
        };
        const initQwerty = () => {
            for (let i = 0; i < 26; ++i) {
                const lo = String.fromCharCode(97 + i);
                const hi = String.fromCharCode(65 + i);
                mapKey('Key' + hi, lo, hi);
            }
            const digitShifted = ')!@#$%^&*(';
            for (let i = 0; i < 10; ++i) {
                mapKey('Digit' + i, String(i), digitShifted[i]);
            }
            mapKey('BracketLeft', '[', '{');
            mapKey('BracketRight', ']', '}');
            mapKey('Backslash', '\\', '|');
            mapKey('Semicolon', ';', ':');
            mapKey('Quote', "'", '"');
            mapKey('Backquote', '`', '~');
            mapKey('Comma', ',', '<');
            mapKey('Period', '.', '>');
            mapKey('Slash', '/', '?');
            mapKey('Minus', '-', '_');
            mapKey('Equal', '=', '+');
            mapKey('Space', ' ', ' ');
        };

        initQwerty();
        const lname = (name || 'qwerty').toLowerCase();
        if (lname === 'azerty') {
            mapKey('KeyA', 'q', 'Q');
            mapKey('KeyQ', 'a', 'A');
            mapKey('KeyZ', 'w', 'W');
            mapKey('KeyW', 'z', 'Z');
            mapKey('KeyM', ',', '?');
            mapKey('Semicolon', 'm', 'M');
        } else if (lname === 'dvorak') {
            mapKey('KeyQ', "'", '"'); mapKey('KeyW', ',', '<'); mapKey('KeyE', '.', '>');
            mapKey('KeyR', 'p', 'P'); mapKey('KeyT', 'y', 'Y'); mapKey('KeyY', 'f', 'F');
            mapKey('KeyU', 'g', 'G'); mapKey('KeyI', 'c', 'C'); mapKey('KeyO', 'r', 'R');
            mapKey('KeyP', 'l', 'L'); mapKey('BracketLeft', '/', '?'); mapKey('BracketRight', '=', '+');
            mapKey('KeyA', 'a', 'A'); mapKey('KeyS', 'o', 'O'); mapKey('KeyD', 'e', 'E');
            mapKey('KeyF', 'u', 'U'); mapKey('KeyG', 'i', 'I'); mapKey('KeyH', 'd', 'D');
            mapKey('KeyJ', 'h', 'H'); mapKey('KeyK', 't', 'T'); mapKey('KeyL', 'n', 'N');
            mapKey('Semicolon', 's', 'S'); mapKey('Quote', '-', '_');
            mapKey('KeyZ', ';', ':'); mapKey('KeyX', 'q', 'Q'); mapKey('KeyC', 'j', 'J');
            mapKey('KeyV', 'k', 'K'); mapKey('KeyB', 'x', 'X'); mapKey('KeyN', 'b', 'B');
            mapKey('KeyM', 'm', 'M'); mapKey('Comma', 'w', 'W'); mapKey('Period', 'v', 'V');
            mapKey('Slash', 'z', 'Z');
        } else if (lname === 'colemak') {
            mapKey('KeyE', 'f', 'F'); mapKey('KeyR', 'p', 'P'); mapKey('KeyT', 'g', 'G');
            mapKey('KeyY', 'j', 'J'); mapKey('KeyU', 'l', 'L'); mapKey('KeyI', 'u', 'U');
            mapKey('KeyO', 'y', 'Y'); mapKey('KeyP', ';', ':');
            mapKey('KeyS', 'r', 'R'); mapKey('KeyD', 's', 'S'); mapKey('KeyF', 't', 'T');
            mapKey('KeyG', 'd', 'D'); mapKey('KeyJ', 'n', 'N'); mapKey('KeyK', 'e', 'E');
            mapKey('KeyL', 'i', 'I'); mapKey('Semicolon', 'o', 'O');
            mapKey('KeyN', 'k', 'K');
        }

        return {
            keyToText(code, shift) {
                const e = keyToText.get(code);
                if (!e) return '';
                return shift && e.shifted ? e.shifted : e.unshifted;
            },
            textToKey(text) {
                return textToKey.get(String(text).toLowerCase()) || '';
            },
        };
    }

    // ---- When Expressions ----
    function tokenizeWhen(input) {
        const tokens = [];
        let pos = 0;
        let canBeRegex = false;
        const n = input.length;

        const nextToken = () => {
            while (pos < n && /\s/.test(input[pos])) ++pos;
            if (pos >= n) return { type: 'End', text: '' };
            const c = input[pos];
            if (c === '(') { ++pos; return { type: 'LParen', text: '(' }; }
            if (c === ')') { ++pos; return { type: 'RParen', text: ')' }; }
            if (c === '!') {
                if (input[pos + 1] === '=') { pos += 2; return { type: 'NotEqual', text: '!=' }; }
                ++pos;
                return { type: 'Not', text: '!' };
            }
            if (c === '&' && input[pos + 1] === '&') { pos += 2; return { type: 'And', text: '&&' }; }
            if (c === '|' && input[pos + 1] === '|') { pos += 2; return { type: 'Or', text: '||' }; }
            if (c === '=') {
                if (input[pos + 1] === '=') { pos += 2; return { type: 'Equal', text: '==' }; }
                if (input[pos + 1] === '~') { pos += 2; return { type: 'RegexMatch', text: '=~' }; }
            }
            if (c === '<') {
                if (input[pos + 1] === '=') { pos += 2; return { type: 'LessEqual', text: '<=' }; }
                ++pos;
                return { type: 'Less', text: '<' };
            }
            if (c === '>') {
                if (input[pos + 1] === '=') { pos += 2; return { type: 'GreaterEqual', text: '>=' }; }
                ++pos;
                return { type: 'Greater', text: '>' };
            }
            if (c === "'" || c === '"') {
                const quote = c;
                ++pos;
                let s = '';
                while (pos < n) {
                    const ch = input[pos++];
                    if (ch === quote) break;
                    if (ch === '\\' && pos < n) {
                        const e = input[pos++];
                        if (e === 'n') s += '\n';
                        else if (e === 't') s += '\t';
                        else if (e === 'r') s += '\r';
                        else s += e;
                    } else {
                        s += ch;
                    }
                }
                return { type: 'String', text: s };
            }
            if (c === '/' && canBeRegex) {
                ++pos;
                let pattern = '';
                let inClass = false;
                while (pos < n) {
                    const ch = input[pos++];
                    if (ch === '/' && !inClass) break;
                    if (ch === '[') inClass = true;
                    if (ch === ']') inClass = false;
                    if (ch === '\\' && pos < n) {
                        pattern += '\\' + input[pos++];
                    } else {
                        pattern += ch;
                    }
                }
                let flags = '';
                while (pos < n && /[A-Za-z]/.test(input[pos])) flags += input[pos++];
                return { type: 'Regex', text: pattern, flags };
            }
            if (/\d/.test(c) || (c === '-' && pos + 1 < n && /\d/.test(input[pos + 1]))) {
                const start = pos;
                if (input[pos] === '-') ++pos;
                while (pos < n && (/\d/.test(input[pos]) || input[pos] === '.')) ++pos;
                const numStr = input.slice(start, pos);
                return { type: 'Number', text: numStr, num: Number(numStr) || 0 };
            }
            if (/[A-Za-z_$]/.test(c)) {
                const start = pos;
                while (pos < n && /[A-Za-z0-9_.\-$:]/.test(input[pos])) ++pos;
                const id = input.slice(start, pos);
                if (id === 'true') return { type: 'Bool', text: 'true', bool: true };
                if (id === 'false') return { type: 'Bool', text: 'false', bool: false };
                if (id === 'in') return { type: 'In', text: 'in' };
                return { type: 'Identifier', text: id };
            }
            ++pos;
            return { type: 'Identifier', text: c };
        };

        return {
            next(allowRegex) {
                canBeRegex = !!allowRegex;
                const t = nextToken();
                tokens.push(t);
                return t;
            },
        };
    }

    function parseWhen(raw) {
        const expr = String(raw || '').trim();
        if (!expr) {
            return { raw: '', weight: 0, regexErrors: [], eval: () => true };
        }
        const lex = tokenizeWhen(expr);
        let cur = lex.next(false);
        const regexErrors = [];

        const advance = (allowRegex) => { cur = lex.next(allowRegex); };

        const compileRe = (pattern, flags) => {
            try {
                return new RegExp(pattern, flags || '');
            } catch (e) {
                regexErrors.push(e && e.message ? e.message : 'invalid regex');
                return null;
            }
        };

        const computeWeight = (node) => {
            switch (node.op) {
                case 'Identifier': return 1;
                case 'Not': return node.a ? computeWeight(node.a) : 1;
                case 'And': return computeWeight(node.a) + computeWeight(node.b);
                case 'Or': return Math.max(computeWeight(node.a), computeWeight(node.b));
                case 'Equal': case 'NotEqual': case 'Less': case 'LessEqual':
                case 'Greater': case 'GreaterEqual': case 'RegexMatch': case 'In':
                    return 2 + computeWeight(node.a) + computeWeight(node.b);
                default: return 0;
            }
        };

        const parsePrimary = () => {
            const t = cur;
            if (t.type === 'Bool') { advance(); return { op: 'Bool', val: t.bool }; }
            if (t.type === 'Number') { advance(); return { op: 'Number', val: t.num, text: t.text }; }
            if (t.type === 'String') { advance(); return { op: 'String', val: t.text }; }
            if (t.type === 'Regex') { advance(); return { op: 'Regex', val: t.text, flags: t.flags }; }
            if (t.type === 'Identifier') { advance(); return { op: 'Identifier', val: t.text }; }
            if (t.type === 'LParen') {
                advance();
                const inner = parseOr();
                if (cur.type === 'RParen') advance();
                return inner;
            }
            return { op: 'Bool', val: true };
        };

        const parseUnary = () => {
            if (cur.type === 'Not') {
                advance();
                return { op: 'Not', a: parseUnary() };
            }
            return parsePrimary();
        };

        const parseComparison = () => {
            const left = parseUnary();
            const t = cur.type;
            if (t === 'Equal' || t === 'NotEqual' || t === 'Less' || t === 'LessEqual' ||
                t === 'Greater' || t === 'GreaterEqual' || t === 'RegexMatch' || t === 'In') {
                const allowRegex = t === 'RegexMatch' || t === 'Equal' || t === 'NotEqual';
                advance(allowRegex);
                const right = parseUnary();
                let re = null;
                if (t === 'RegexMatch' && (right.op === 'Regex' || right.op === 'String')) {
                    re = compileRe(right.val, right.flags || '');
                }
                return { op: t, a: left, b: right, re };
            }
            return left;
        };

        const parseAnd = () => {
            let left = parseComparison();
            while (cur.type === 'And') {
                advance();
                left = { op: 'And', a: left, b: parseComparison() };
            }
            return left;
        };

        function parseOr() {
            let left = parseAnd();
            while (cur.type === 'Or') {
                advance();
                left = { op: 'Or', a: left, b: parseAnd() };
            }
            return left;
        }

        const root = parseOr();

        const toBool = (v) => {
            if (typeof v === 'boolean') return v;
            if (typeof v === 'number') return v !== 0;
            if (typeof v === 'string') return v.length > 0 && v !== 'false' && v !== '0';
            return false;
        };
        const toNum = (v) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'boolean') return v ? 1 : 0;
            if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
            return 0;
        };
        const toStr = (v) => {
            if (typeof v === 'string') return v;
            if (typeof v === 'boolean') return v ? 'true' : 'false';
            if (typeof v === 'number') return String(v);
            return '';
        };

        const resolveVal = (node, ctx) => {
            switch (node.op) {
                case 'Bool': return node.val;
                case 'Number': return node.val;
                case 'String': case 'Regex': return node.val;
                case 'Identifier': return ctx.get(node.val);
                default: return evalNode(node, ctx);
            }
        };

        function evalNode(node, ctx) {
            switch (node.op) {
                case 'Bool': return node.val;
                case 'Number': return node.val !== 0;
                case 'String': return node.val.length > 0 && node.val !== 'false' && node.val !== '0';
                case 'Identifier': return toBool(ctx.get(node.val));
                case 'Not': return !evalNode(node.a, ctx);
                case 'And': return evalNode(node.a, ctx) && evalNode(node.b, ctx);
                case 'Or': return evalNode(node.a, ctx) || evalNode(node.b, ctx);
                case 'Equal':
                case 'NotEqual': {
                    const l = resolveVal(node.a, ctx);
                    const r = resolveVal(node.b, ctx);
                    let eq;
                    if (typeof l === 'boolean' || typeof r === 'boolean') eq = toBool(l) === toBool(r);
                    else if (typeof l === 'number' || typeof r === 'number') eq = Math.abs(toNum(l) - toNum(r)) < 1e-9;
                    else eq = toStr(l) === toStr(r);
                    return node.op === 'Equal' ? eq : !eq;
                }
                case 'Less': return toNum(resolveVal(node.a, ctx)) < toNum(resolveVal(node.b, ctx));
                case 'LessEqual': return toNum(resolveVal(node.a, ctx)) <= toNum(resolveVal(node.b, ctx));
                case 'Greater': return toNum(resolveVal(node.a, ctx)) > toNum(resolveVal(node.b, ctx));
                case 'GreaterEqual': return toNum(resolveVal(node.a, ctx)) >= toNum(resolveVal(node.b, ctx));
                case 'RegexMatch': {
                    const text = toStr(resolveVal(node.a, ctx));
                    if (node.re) return node.re.test(text);
                    if (node.b.op === 'Regex' || node.b.op === 'String') return false;
                    const pat = toStr(resolveVal(node.b, ctx));
                    try { return new RegExp(pat).test(text); } catch { return false; }
                }
                case 'In': {
                    const needle = toStr(resolveVal(node.a, ctx));
                    const hay = toStr(resolveVal(node.b, ctx));
                    return hay.indexOf(needle) !== -1;
                }
                default: return false;
            }
        }

        return {
            raw: expr,
            root,
            weight: computeWeight(root),
            regexErrors,
            eval: (ctx) => evalNode(root, ctx),
        };
    }

    function checkWhenSyntax(exprIn) {
        if (typeof exprIn !== 'string') return false;
        const expr = exprIn.trim();
        if (!expr) return true;

        let parens = 0, inSingle = false, inDouble = false, inRegex = false, escaped = false;
        for (let i = 0; i < expr.length; ++i) {
            const ch = expr[i];
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === "'" && !inDouble && !inRegex) { inSingle = !inSingle; continue; }
            if (ch === '"' && !inSingle && !inRegex) { inDouble = !inDouble; continue; }
            if (ch === '/' && !inSingle && !inDouble) {
                if (inRegex) {
                    inRegex = false;
                } else {
                    let j = i;
                    while (j > 0 && /\s/.test(expr[j - 1])) --j;
                    if (j >= 2 && ((expr[j - 2] === '=' && (expr[j - 1] === '~' || expr[j - 1] === '=')) ||
                                   (expr[j - 2] === '!' && expr[j - 1] === '='))) {
                        inRegex = true;
                    }
                }
                continue;
            }
            if (!inSingle && !inDouble && !inRegex) {
                if (ch === '(') ++parens;
                else if (ch === ')' && --parens < 0) return false;
            }
        }
        if (parens !== 0 || inSingle || inDouble || inRegex || escaped) return false;
        const last = expr[expr.length - 1];
        if (last === '&' || last === '|' || last === '=' || last === '!' || last === '<' || last === '>') return false;

        const w = parseWhen(expr);
        return w.regexErrors.length === 0;
    }

    // ---- JSONC parser for VS Code keybindings ----
    function stripJsonCommentsAndTrailingCommas(src) {
        let out = '';
        let i = 0;
        const n = src.length;
        while (i < n) {
            const c = src[i];
            if (c === '"') {
                out += c;
                ++i;
                while (i < n) {
                    const ch = src[i++];
                    out += ch;
                    if (ch === '\\' && i < n) {
                        out += src[i++];
                    } else if (ch === '"') {
                        break;
                    }
                }
                continue;
            }
            if (c === '/' && src[i + 1] === '/') {
                i += 2;
                while (i < n && src[i] !== '\n' && src[i] !== '\r') ++i;
                continue;
            }
            if (c === '/' && src[i + 1] === '*') {
                i += 2;
                while (i + 1 < n && !(src[i] === '*' && src[i + 1] === '/')) ++i;
                if (i + 1 < n) i += 2;
                continue;
            }
            out += c;
            ++i;
        }
        // Strip trailing commas before ] or }
        return out.replace(/,\s*([}\]])/g, '$1');
    }

    // ---- Engine ----
    class Engine {
        constructor(opts) {
            let layoutName = 'qwerty';
            this._timeoutMs = 5000;
            this._context = new Map();
            this._bindings = [];
            this._nextRegIdx = 0;
            this._pendingSeq = [];
            this._chordStartMs = 0;

            if (opts && typeof opts === 'object') {
                if (typeof opts.layout === 'string') layoutName = opts.layout;
                const tv = opts.timeoutMs !== undefined ? opts.timeoutMs
                    : (opts.chordTimeoutMs !== undefined ? opts.chordTimeoutMs : opts.timeout);
                if (typeof tv === 'number' && tv > 0) this._timeoutMs = tv;
                if (opts.context && typeof opts.context === 'object') {
                    for (const k of Object.keys(opts.context)) {
                        this._setCtxVal(k, opts.context[k]);
                    }
                }
            }
            this._layout = makeLayout(layoutName);
        }

        _setCtxVal(key, val) {
            if (val === undefined || val === null) {
                this._context.delete(key);
            } else if (typeof val === 'boolean' || typeof val === 'number' || typeof val === 'string') {
                this._context.set(key, val);
            }
        }

        _addInternal(seq, command, whenRaw, argsStr, priority) {
            if (command.startsWith('-')) {
                const targetCmd = command.slice(1);
                this._bindings = this._bindings.filter((b) => {
                    if (b.command !== targetCmd) return true;
                    if (seq && seq.length > 0 && !sequencesEqual(b.sequence, seq)) return true;
                    return false;
                });
                return;
            }
            const whenExpr = whenRaw ? parseWhen(whenRaw) : null;
            this._bindings.push({
                sequence: seq,
                command,
                whenRaw: whenRaw || '',
                whenExpr,
                args: argsStr || '',
                priority: priority || 0,
                regIndex: this._nextRegIdx++,
            });
        }

        addBinding(b) {
            if (!b || typeof b !== 'object') throw new TypeError('addBinding expects a keybinding object');
            if (typeof b.key !== 'string') throw new TypeError("Binding must specify a 'key' string");
            const seq = parseSequenceInternal(b.key);
            if (!seq) throw new Error('Invalid key sequence: ' + b.key);
            if (typeof b.command !== 'string') throw new TypeError("Binding must specify a 'command' string");
            const whenRaw = typeof b.when === 'string' ? b.when : '';
            let argsStr = '';
            if (typeof b.args === 'string') argsStr = b.args;
            else if (b.args !== undefined && b.args !== null) argsStr = JSON.stringify(b.args);
            const priority = typeof b.priority === 'number' ? (b.priority | 0) : 0;
            this._addInternal(seq, b.command, whenRaw, argsStr, priority);
        }

        loadJson(jsonStr) {
            if (typeof jsonStr !== 'string') throw new TypeError('loadJson expects a string');
            const clean = stripJsonCommentsAndTrailingCommas(jsonStr);
            const parsed = JSON.parse(clean);
            const objs = Array.isArray(parsed)
                ? parsed.filter((x) => x && typeof x === 'object' && !Array.isArray(x))
                : (parsed && typeof parsed === 'object' ? [parsed] : null);
            if (!objs) throw new Error('Expected array or object at JSON root');

            const plat = hostPlatform();
            for (const obj of objs) {
                if (typeof obj.command !== 'string') continue;
                let keyStr = '';
                if (typeof obj[plat] === 'string') keyStr = obj[plat];
                if (!keyStr && typeof obj.key === 'string') keyStr = obj.key;
                const seq = keyStr ? (parseSequenceInternal(keyStr) || []) : [];
                const whenRaw = typeof obj.when === 'string' ? obj.when : '';
                const argsStr = obj.args !== undefined ? JSON.stringify(obj.args) : '';
                this._addInternal(seq, obj.command, whenRaw, argsStr, 0);
            }
            return true;
        }

        exportJson(pretty) {
            const p = pretty === undefined ? true : !!pretty;
            const arr = this._bindings.map((b) => {
                const obj = { command: b.command };
                if (b.sequence.length) obj.key = formatSequenceInternal(b.sequence);
                if (b.whenRaw) obj.when = b.whenRaw;
                if (b.args) {
                    try { obj.args = JSON.parse(b.args); } catch { obj.args = b.args; }
                }
                return obj;
            });
            return JSON.stringify(arr, null, p ? 2 : 0);
        }

        setContext(keyOrObj, val) {
            if (keyOrObj && typeof keyOrObj === 'object') {
                for (const k of Object.keys(keyOrObj)) this._setCtxVal(k, keyOrObj[k]);
            } else if (typeof keyOrObj === 'string') {
                this._setCtxVal(keyOrObj, val);
            }
        }

        getContext(key) {
            return this._context.get(String(key));
        }

        removeContext(key) {
            return this._context.delete(String(key));
        }

        clearContext() {
            this._context.clear();
        }

        getBindings() {
            return this._bindings.map((b) => ({
                key: formatSequenceInternal(b.sequence),
                command: b.command,
                when: b.whenRaw,
                priority: b.priority,
            }));
        }

        detectConflicts() {
            const items = [];
            const n = this._bindings.length;
            for (let i = 0; i < n; ++i) {
                for (let j = i + 1; j < n; ++j) {
                    const b1 = this._bindings[i];
                    const b2 = this._bindings[j];
                    const overlap = !b1.whenExpr || !b2.whenExpr || b1.whenRaw === b2.whenRaw ||
                        (!b1.whenRaw || !b2.whenRaw);
                    if (!overlap) continue;
                    if (sequencesEqual(b1.sequence, b2.sequence)) {
                        items.push({
                            type: 'exactDuplicate',
                            key: formatSequenceInternal(b1.sequence),
                            commands: [b1.command, b2.command],
                        });
                    } else if (isProperPrefixOf(b1.sequence, b2.sequence) || isProperPrefixOf(b2.sequence, b1.sequence)) {
                        items.push({
                            type: 'prefixShadow',
                            key: formatSequenceInternal(b1.sequence),
                            commands: [b1.command, b2.command],
                        });
                    }
                }
            }
            return items;
        }

        feed(evt) {
            if (!evt || typeof evt !== 'object') throw new TypeError('feed expects a keyboard event object');
            const typeStr = typeof evt.type === 'string' ? evt.type.toLowerCase() : 'keydown';
            if (typeStr === 'keyup' || typeStr === 'up' || typeStr === 'repeat') {
                return { type: 'unhandled' };
            }
            const code = typeof evt.code === 'string' ? keyCodeFromString(evt.code) : '';
            if (MODIFIER_CODES.has(code)) {
                return { type: 'unhandled' };
            }

            const now = Date.now();
            if (this._pendingSeq.length > 0 && now - this._chordStartMs >= this._timeoutMs) {
                this._pendingSeq = [];
            }

            if (this._pendingSeq.length > 0 && code === 'Escape') {
                const seq = formatSequenceInternal(this._pendingSeq);
                this._pendingSeq = [];
                return { type: 'cancelled', reason: 'escape', sequence: seq };
            }

            const ctrl = !!(evt.ctrlKey !== undefined ? evt.ctrlKey : evt.ctrl);
            const shift = !!(evt.shiftKey !== undefined ? evt.shiftKey : evt.shift);
            const alt = !!(evt.altKey !== undefined ? evt.altKey : evt.alt);
            const meta = !!(evt.metaKey !== undefined ? evt.metaKey :
                (evt.meta !== undefined ? evt.meta : (evt.superKey !== undefined ? evt.superKey : evt.super)));

            let text = typeof evt.key === 'string' ? evt.key : '';
            let effCode = code;
            if (!text && effCode) text = this._layout.keyToText(effCode, shift);
            if (!effCode && text) effCode = this._layout.textToKey(text);

            const chord = { ctrl, shift, alt, meta, code: effCode, character: text };
            const testSeq = this._pendingSeq.concat([chord]);

            const prefixCandidates = [];
            const exactMatches = [];
            for (const b of this._bindings) {
                if (isProperPrefixOf(testSeq, b.sequence)) {
                    if (!b.whenExpr || b.whenExpr.eval(this._context)) prefixCandidates.push(b);
                } else if (sequencesEqual(testSeq, b.sequence)) {
                    if (!b.whenExpr || b.whenExpr.eval(this._context)) exactMatches.push(b);
                }
            }

            if (prefixCandidates.length > 0) {
                this._pendingSeq = testSeq;
                this._chordStartMs = now;
                const seen = new Set();
                const candidates = [];
                for (const c of prefixCandidates) {
                    if (!seen.has(c.command)) {
                        seen.add(c.command);
                        candidates.push(c.command);
                    }
                }
                return {
                    type: 'pending',
                    sequence: formatSequenceInternal(this._pendingSeq),
                    candidates,
                    timeoutMs: this._timeoutMs,
                };
            }

            if (exactMatches.length > 0) {
                exactMatches.sort((a, b) => {
                    if (a.priority !== b.priority) return b.priority - a.priority;
                    const wa = a.whenExpr ? a.whenExpr.weight : 0;
                    const wb = b.whenExpr ? b.whenExpr.weight : 0;
                    if (wa !== wb) return wb - wa;
                    return b.regIndex - a.regIndex;
                });
                const best = exactMatches[0];
                this._pendingSeq = [];
                const res = {
                    type: 'match',
                    command: best.command,
                    sequence: formatSequenceInternal(best.sequence),
                };
                if (best.args) {
                    try { res.args = JSON.parse(best.args); } catch { res.args = best.args; }
                }
                return res;
            }

            if (this._pendingSeq.length > 0) {
                const seq = formatSequenceInternal(this._pendingSeq);
                this._pendingSeq = [];
                return { type: 'cancelled', reason: 'unboundKey', sequence: seq };
            }

            return { type: 'unhandled' };
        }

        dispatch(evt) {
            return this.feed(evt);
        }

        reset() {
            this._pendingSeq = [];
        }

        isPendingChord() {
            return this._pendingSeq.length > 0;
        }

        getPendingSequence() {
            return formatSequenceInternal(this._pendingSeq);
        }
    }

    const ns = mount(globalThis.bro, 'keys');
    ns.Engine = Engine;
    ns.parseChord = (str) => {
        const c = parseChordInternal(str);
        return c ? chordToJsObj(c) : null;
    };
    ns.formatChord = (obj) => formatChordInternal(jsObjToChord(obj));
    ns.validateWhen = (expr) => checkWhenSyntax(expr);
    ns.parseSequence = (str) => {
        const seq = parseSequenceInternal(str);
        return seq ? seq.map(chordToJsObj) : null;
    };
    ns.formatSequence = (seq) => {
        if (typeof seq === 'string') return seq;
        if (Array.isArray(seq) && seq.length > 0) {
            return formatSequenceInternal(seq.map(jsObjToChord));
        }
        return '';
    };
})();
