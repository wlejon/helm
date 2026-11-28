// bro.conf — Layered desktop configuration store with schemas, validation,
// atomic coalesced persistence, and cross-process change watchers.

(function () {
    'use strict';

    const hooks = __bro_conf;
    const mount = (root, name) => (root[name] !== undefined ? root[name] : (root[name] = {}));

    const normalizeSection = (p) => {
        let s = String(p || '');
        while (s.length && s[0] === '/') s = s.slice(1);
        while (s.length && s[s.length - 1] === '/') s = s.slice(0, -1);
        return s.replace(/\//g, '.');
    };

    const displayKey = (path, key) => (path ? path + '.' + key : key);

    const parsePathKey = (args) => {
        if (!args.length) return { path: '', key: '' };
        if (args.length >= 2 && args[1] !== undefined && args[1] !== null && typeof args[1] !== 'function') {
            return { path: String(args[0]), key: String(args[1]) };
        }
        const s = String(args[0]);
        const dot = s.lastIndexOf('.');
        if (dot >= 0) return { path: s.slice(0, dot), key: s.slice(dot + 1) };
        return { path: '', key: s };
    };

    const parseSetArgs = (args) => {
        if (args.length >= 3) {
            return { ok: true, path: String(args[0]), key: String(args[1]), val: args[2] };
        }
        if (args.length === 2) {
            const s = String(args[0]);
            const dot = s.lastIndexOf('.');
            if (dot >= 0) return { ok: true, path: s.slice(0, dot), key: s.slice(dot + 1), val: args[1] };
            return { ok: true, path: '', key: s, val: args[1] };
        }
        return { ok: false };
    };

    const typeFromString = (str) => {
        switch (str) {
            case 'bool': case 'boolean': return 'bool';
            case 'int': case 'int64': case 'integer': return 'int';
            case 'double': case 'float': case 'number': return 'double';
            case 'string': case 'str': return 'string';
            case 'string_list': case 'strv': case 'list': return 'string_list';
            case 'enum': return 'enum';
            case 'color': return 'color';
            case 'rect': return 'rect';
            case 'dictionary': case 'dict': case 'map': return 'dictionary';
            default: return 'string';
        }
    };

    // ---- Color / Rect helpers ----
    const parseColorHex = (hexIn) => {
        let h = String(hexIn).trim();
        if (h[0] === '#') h = h.slice(1);
        if (!/^[0-9a-fA-F]+$/.test(h)) return null;
        if (h.length === 3) {
            return {
                r: parseInt(h[0] + h[0], 16),
                g: parseInt(h[1] + h[1], 16),
                b: parseInt(h[2] + h[2], 16),
                a: 255,
            };
        }
        if (h.length === 4) {
            return {
                r: parseInt(h[0] + h[0], 16),
                g: parseInt(h[1] + h[1], 16),
                b: parseInt(h[2] + h[2], 16),
                a: parseInt(h[3] + h[3], 16),
            };
        }
        if (h.length === 6) {
            return {
                r: parseInt(h.slice(0, 2), 16),
                g: parseInt(h.slice(2, 4), 16),
                b: parseInt(h.slice(4, 6), 16),
                a: 255,
            };
        }
        if (h.length === 8) {
            return {
                r: parseInt(h.slice(0, 2), 16),
                g: parseInt(h.slice(2, 4), 16),
                b: parseInt(h.slice(4, 6), 16),
                a: parseInt(h.slice(6, 8), 16),
            };
        }
        return null;
    };

    const colorToHex = (c) => {
        const h2 = (n) => (n & 0xFF).toString(16).padStart(2, '0');
        if (c.a !== 255) return '#' + h2(c.r) + h2(c.g) + h2(c.b) + h2(c.a);
        return '#' + h2(c.r) + h2(c.g) + h2(c.b);
    };

    const parseRectStr = (sIn) => {
        let s = String(sIn).trim();
        if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
        const parts = s.split(/[\s,]+/).filter(Boolean);
        if (parts.length !== 4) return null;
        const nums = parts.map((p) => {
            if (!/^[+-]?\d+$/.test(p)) return NaN;
            return parseInt(p, 10);
        });
        if (nums.some((n) => !Number.isFinite(n))) return null;
        return { x: nums[0], y: nums[1], width: nums[2], height: nums[3] };
    };

    // ---- Serialization & Parsing ----
    const serializeValue = (val, expectedType) => {
        if (val === undefined || val === null) return 'null';
        if (expectedType === 'bool') return val ? 'true' : 'false';
        if (expectedType === 'int') return String(Math.trunc(Number(val)));
        if (expectedType === 'double') {
            const d = Number(val);
            if (Number.isNaN(d)) return 'nan';
            if (d === Infinity) return 'inf';
            if (d === -Infinity) return '-inf';
            let s = String(d);
            if (!s.includes('.') && !s.includes('e') && !s.includes('E')) s += '.0';
            return s;
        }
        if (expectedType === 'string' || expectedType === 'enum') return JSON.stringify(String(val));
        if (expectedType === 'string_list') return '[' + val.map((x) => JSON.stringify(String(x))).join(', ') + ']';
        if (expectedType === 'color') return JSON.stringify(colorToHex(val));
        if (expectedType === 'rect') return `[${val.x | 0}, ${val.y | 0}, ${val.width | 0}, ${val.height | 0}]`;
        if (expectedType === 'dictionary') {
            const keys = Object.keys(val).sort();
            return '{' + keys.map((k) => JSON.stringify(k) + ': ' + serializeValue(val[k])).join(', ') + '}';
        }

        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (typeof val === 'number') {
            if (Number.isInteger(val) && val >= -9007199254740991 && val <= 9007199254740991) return String(val);
            if (Number.isNaN(val)) return 'nan';
            if (val === Infinity) return 'inf';
            if (val === -Infinity) return '-inf';
            let s = String(val);
            if (!s.includes('.') && !s.includes('e') && !s.includes('E')) s += '.0';
            return s;
        }
        if (typeof val === 'string') return JSON.stringify(val);
        if (Array.isArray(val)) return '[' + val.map((x) => JSON.stringify(String(x))).join(', ') + ']';
        if (typeof val === 'object') {
            if (typeof val.r === 'number' && typeof val.g === 'number' && typeof val.b === 'number') {
                return JSON.stringify(colorToHex({ r: val.r, g: val.g, b: val.b, a: val.a === undefined ? 255 : val.a }));
            }
            if (typeof val.x === 'number' && typeof val.y === 'number' && typeof val.width === 'number' && typeof val.height === 'number') {
                return `[${val.x | 0}, ${val.y | 0}, ${val.width | 0}, ${val.height | 0}]`;
            }
            const keys = Object.keys(val).sort();
            return '{' + keys.map((k) => JSON.stringify(k) + ': ' + serializeValue(val[k])).join(', ') + '}';
        }
        return 'null';
    };

    const parseStringToken = (text, posRef) => {
        let pos = posRef.i + 1;
        let res = '';
        while (pos < text.length) {
            const c = text[pos++];
            if (c === '"') { posRef.i = pos; return res; }
            if (c === '\\' && pos < text.length) {
                const e = text[pos++];
                if (e === '"') res += '"';
                else if (e === '\\') res += '\\';
                else if (e === '/') res += '/';
                else if (e === 'b') res += '\b';
                else if (e === 'f') res += '\f';
                else if (e === 'n') res += '\n';
                else if (e === 'r') res += '\r';
                else if (e === 't') res += '\t';
                else if (e === 'u' && pos + 4 <= text.length) {
                    res += String.fromCharCode(parseInt(text.slice(pos, pos + 4), 16));
                    pos += 4;
                } else res += e;
            } else {
                res += c;
            }
        }
        throw new Error('Unclosed string literal');
    };

    const parseInferred = (rawIn) => {
        const text = String(rawIn).trim();
        if (!text) return '';
        const posRef = { i: 0 };
        const skipWs = () => { while (posRef.i < text.length && /\s/.test(text[posRef.i])) posRef.i++; };
        const parseVal = () => {
            skipWs();
            if (posRef.i >= text.length) throw new Error('Unexpected end');
            const c = text[posRef.i];
            if (c === '"') return parseStringToken(text, posRef);
            if (c === '[') {
                posRef.i++;
                skipWs();
                if (text[posRef.i] === ']') { posRef.i++; return []; }
                const items = [];
                let allInts = true;
                while (posRef.i < text.length) {
                    const v = parseVal();
                    if (typeof v !== 'number' || !Number.isInteger(v)) allInts = false;
                    items.push(v);
                    skipWs();
                    if (text[posRef.i] === ',') posRef.i++;
                    else if (text[posRef.i] === ']') { posRef.i++; break; }
                    else throw new Error('Expected , or ]');
                }
                if (allInts && items.length === 4) {
                    return { x: items[0], y: items[1], width: items[2], height: items[3] };
                }
                return items.map((x) => (typeof x === 'string' ? x : serializeValue(x)));
            }
            if (c === '{') {
                posRef.i++;
                skipWs();
                const obj = {};
                if (text[posRef.i] === '}') { posRef.i++; return obj; }
                while (posRef.i < text.length) {
                    skipWs();
                    let k;
                    if (text[posRef.i] === '"') k = parseStringToken(text, posRef);
                    else {
                        const ks = posRef.i;
                        while (posRef.i < text.length && text[posRef.i] !== ':' && !/\s/.test(text[posRef.i])) posRef.i++;
                        k = text.slice(ks, posRef.i);
                    }
                    skipWs();
                    if (text[posRef.i] !== ':') throw new Error('Expected :');
                    posRef.i++;
                    obj[k] = parseVal();
                    skipWs();
                    if (text[posRef.i] === ',') posRef.i++;
                    else if (text[posRef.i] === '}') { posRef.i++; break; }
                    else throw new Error('Expected , or }');
                }
                return obj;
            }
            if (c === '#') {
                const start = posRef.i;
                while (posRef.i < text.length && (text[posRef.i] === '#' || /[0-9a-fA-F]/.test(text[posRef.i]))) posRef.i++;
                const col = parseColorHex(text.slice(start, posRef.i));
                if (col) return col;
                throw new Error('Invalid color');
            }
            const rest = text.slice(posRef.i);
            const bm = rest.match(/^(true|false)/i);
            if (bm && (posRef.i + bm[0].length === text.length || /[\s,\]}]/.test(text[posRef.i + bm[0].length]))) {
                posRef.i += bm[0].length;
                return bm[0].toLowerCase() === 'true';
            }
            if (rest.startsWith('null') && (posRef.i + 4 === text.length || /[\s,\]}]/.test(text[posRef.i + 4]))) {
                posRef.i += 4;
                return undefined;
            }
            if (c === '-' || c === '+' || (c >= '0' && c <= '9')) {
                const start = posRef.i;
                if (text[posRef.i] === '-' || text[posRef.i] === '+') posRef.i++;
                while (posRef.i < text.length && /[0-9.eE+-]/.test(text[posRef.i])) posRef.i++;
                const ns = text.slice(start, posRef.i);
                const num = Number(ns);
                if (!Number.isNaN(num)) return num;
                posRef.i = start;
            }
            const start = posRef.i;
            while (posRef.i < text.length && text[posRef.i] !== ',' && text[posRef.i] !== ']' && text[posRef.i] !== '}' && !/\s/.test(text[posRef.i])) posRef.i++;
            const raw = text.slice(start, posRef.i);
            if (raw === 'true' || raw === 'yes' || raw === 'on') return true;
            if (raw === 'false' || raw === 'no' || raw === 'off') return false;
            return raw;
        };
        return parseVal();
    };

    const deserialize = (expectedType, rawIn) => {
        const text = String(rawIn).trim();
        if (!expectedType) return parseInferred(text);
        switch (expectedType) {
            case 'bool': {
                const lo = text.toLowerCase();
                if (lo === 'true' || lo === '1' || lo === 'yes' || lo === 'on') return true;
                if (lo === 'false' || lo === '0' || lo === 'no' || lo === 'off') return false;
                throw new Error('Invalid bool');
            }
            case 'int': {
                if (!/^[+-]?\d+$/.test(text)) throw new Error('Invalid int');
                return parseInt(text, 10);
            }
            case 'double': {
                if (text === 'nan') return NaN;
                if (text === 'inf') return Infinity;
                if (text === '-inf') return -Infinity;
                const d = Number(text);
                if (!Number.isFinite(d) && text !== '0') throw new Error('Invalid double');
                return d;
            }
            case 'string':
            case 'enum': {
                if (text.length >= 2 && text[0] === '"' && text[text.length - 1] === '"') {
                    return parseStringToken(text, { i: 0 });
                }
                return text;
            }
            case 'string_list': {
                if (text.startsWith('[') && text.endsWith(']')) {
                    const arr = parseInferred(text);
                    if (Array.isArray(arr)) return arr;
                }
                const delim = text.includes(';') ? ';' : ',';
                return text.split(delim).map((s) => s.trim()).filter(Boolean);
            }
            case 'color': {
                let h = text;
                if (h.length >= 2 && h[0] === '"' && h[h.length - 1] === '"') h = h.slice(1, -1);
                const c = parseColorHex(h);
                if (!c) throw new Error('Invalid color');
                return c;
            }
            case 'rect': {
                const r = parseRectStr(text);
                if (!r) throw new Error('Invalid rect');
                return r;
            }
            case 'dictionary': {
                const v = parseInferred(text);
                if (v && typeof v === 'object' && !Array.isArray(v)) return v;
                throw new Error('Invalid dictionary');
            }
        }
        return parseInferred(text);
    };

    const parseIni = (content) => {
        const map = new Map();
        if (!content) return map;
        let current = '';
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; ++i) {
            const line = lines[i].trim();
            if (!line || line[0] === '#' || line[0] === ';') continue;
            if (line[0] === '[' && line[line.length - 1] === ']') {
                current = line.slice(1, -1).trim();
                if (!map.has(current)) map.set(current, new Map());
                continue;
            }
            let eq = line.indexOf('=');
            if (eq < 0) eq = line.indexOf(':');
            if (eq >= 0 && current) {
                const k = line.slice(0, eq).trim();
                const v = line.slice(eq + 1).trim();
                if (k) {
                    let sec = map.get(current);
                    if (!sec) { sec = new Map(); map.set(current, sec); }
                    sec.set(k, v);
                }
            }
        }
        return map;
    };

    const cloneVal = (v) => {
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.slice();
        const o = {};
        for (const k of Object.keys(v)) o[k] = cloneVal(v[k]);
        return o;
    };

    const valuesEqual = (a, b) => {
        if (a === b) return true;
        if (typeof a !== typeof b || a === null || b === null) return false;
        if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
        return false;
    };

    const coerceForSchema = (val, expectedType) => {
        if (!expectedType) {
            if (typeof val === 'boolean' || typeof val === 'number' || typeof val === 'string') return val;
            if (Array.isArray(val)) return val.map((x) => String(x));
            if (val && typeof val === 'object') {
                if (typeof val.r === 'number' && typeof val.g === 'number' && typeof val.b === 'number') {
                    return { r: val.r & 0xFF, g: val.g & 0xFF, b: val.b & 0xFF, a: val.a === undefined ? 255 : (val.a & 0xFF) };
                }
                if (typeof val.x === 'number' && typeof val.y === 'number' && typeof val.width === 'number' && typeof val.height === 'number') {
                    return { x: val.x | 0, y: val.y | 0, width: val.width | 0, height: val.height | 0 };
                }
                return cloneVal(val);
            }
            return undefined;
        }
        switch (expectedType) {
            case 'bool':
                if (typeof val === 'boolean') return val;
                if (typeof val === 'number') return val !== 0;
                throw new Error('ValidationError: Expected boolean value');
            case 'int':
                if (typeof val !== 'number' || !Number.isFinite(val)) throw new Error('ValidationError: Expected integer number');
                return Math.trunc(val);
            case 'double':
                if (typeof val !== 'number') throw new Error('ValidationError: Expected number');
                return val;
            case 'string':
                if (typeof val !== 'string') throw new Error('ValidationError: Expected string');
                return val;
            case 'string_list':
                if (!Array.isArray(val)) throw new Error('ValidationError: Expected string array');
                return val.map((x) => String(x));
            case 'enum':
                if (typeof val === 'string') return val;
                if (val && typeof val === 'object' && typeof val.name === 'string') return val.name;
                throw new Error('ValidationError: Expected enum string or object with name');
            case 'color':
                if (typeof val === 'string') {
                    const c = parseColorHex(val);
                    if (!c) throw new Error('ValidationError: Invalid color hex string');
                    return c;
                }
                if (val && typeof val === 'object') {
                    return { r: val.r & 0xFF, g: val.g & 0xFF, b: val.b & 0xFF, a: val.a === undefined ? 255 : (val.a & 0xFF) };
                }
                throw new Error('ValidationError: Expected color object or hex string');
            case 'rect':
                if (val && typeof val === 'object') {
                    return { x: val.x | 0, y: val.y | 0, width: val.width | 0, height: val.height | 0 };
                }
                throw new Error('ValidationError: Expected rect object with x, y, width, height');
            case 'dictionary':
                if (!val || typeof val !== 'object' || Array.isArray(val)) throw new Error('ValidationError: Expected dictionary object');
                return cloneVal(val);
        }
        return val;
    };

    const validateKeySchema = (ks, val) => {
        if (val === undefined) throw new Error(`ValidationError: Value for key '${ks.name}' is invalid/null`);
        if (ks.type === 'int' || ks.type === 'double') {
            if (ks.min !== undefined && val < ks.min) {
                throw new Error(`ValidationError: Value ${val} for key '${ks.name}' is less than minimum ${ks.min}`);
            }
            if (ks.max !== undefined && val > ks.max) {
                throw new Error(`ValidationError: Value ${val} for key '${ks.name}' is greater than maximum ${ks.max}`);
            }
        }
        if (ks.allowedEnum && ks.allowedEnum.length && (ks.type === 'enum' || ks.type === 'string')) {
            if (!ks.allowedEnum.includes(val)) {
                throw new Error(`ValidationError: Value '${val}' for enum key '${ks.name}' is not one of the allowed values`);
            }
        }
    };

    // ---- Store State ----
    const initial = hooks.loadInitial();
    let userMap = parseIni(initial.userText);
    let systemMaps = (initial.systemTexts || []).map(parseIni);

    const schemasById = new Map();
    const schemasByPath = new Map();
    const findSchema = (idOrPath) => {
        let s = schemasById.get(idOrPath) || schemasByPath.get(idOrPath);
        if (s) return s;
        if (idOrPath.endsWith('/')) s = schemasByPath.get(idOrPath.slice(0, -1));
        else s = schemasByPath.get(idOrPath + '/');
        return s || null;
    };

    const getOptionalRaw = (section, key, expectedType) => {
        const uSec = userMap.get(section);
        if (uSec && uSec.has(key)) {
            try { return deserialize(expectedType, uSec.get(key)); } catch {}
        }
        for (let i = 0; i < systemMaps.length; ++i) {
            const sSec = systemMaps[i].get(section);
            if (sSec && sSec.has(key)) {
                try { return deserialize(expectedType, sSec.get(key)); } catch {}
            }
        }
        return undefined;
    };

    const getOptional = (path, key) => {
        const section = normalizeSection(path);
        const schema = findSchema(path);
        const ks = schema ? schema.keys.get(key) : null;
        const val = getOptionalRaw(section, key, ks ? ks.type : undefined);
        if (val !== undefined) return cloneVal(val);
        if (ks && ks.defaultValue !== undefined) return cloneVal(ks.defaultValue);
        return undefined;
    };

    const listKeysFor = (path) => {
        const section = normalizeSection(path);
        const keys = new Set();
        const uSec = userMap.get(section);
        if (uSec) for (const k of uSec.keys()) keys.add(k);
        for (let i = 0; i < systemMaps.length; ++i) {
            const sSec = systemMaps[i].get(section);
            if (sSec) for (const k of sSec.keys()) keys.add(k);
        }
        const schema = findSchema(path);
        if (schema) for (const k of schema.keys.keys()) keys.add(k);
        return Array.from(keys).sort();
    };

    // ---- Watchers ----
    let nextToken = 1;
    const watchers = new Map();
    let changeQueue = [];

    const notifyWatchers = (path, key, newVal) => {
        const normPath = normalizeSection(path);
        for (const w of watchers.values()) {
            const wNorm = normalizeSection(w.path);
            if (wNorm === normPath && (w.key === '' || w.key === key)) {
                changeQueue.push({ token: w.token, path, key, newValue: cloneVal(newVal) });
            }
        }
    };

    const collectEffectiveRaw = (uMap, sMaps) => {
        const out = new Map();
        for (const [sec, keys] of uMap) {
            for (const [k, raw] of keys) out.set(sec + '\0' + k, raw);
        }
        for (let i = 0; i < sMaps.length; ++i) {
            for (const [sec, keys] of sMaps[i]) {
                for (const [k, raw] of keys) {
                    const id = sec + '\0' + k;
                    if (!out.has(id)) out.set(id, raw);
                }
            }
        }
        return out;
    };

    hooks.onTick(() => {
        const ext = hooks.pollExternal();
        if (ext) {
            const newUser = parseIni(ext.userText);
            const newSystems = (ext.systemTexts || []).map(parseIni);
            const pend = ext.pending || [];
            for (let i = 0; i < pend.length; ++i) {
                const [sec, k, raw] = pend[i];
                if (raw !== null && raw !== undefined) {
                    let m = newUser.get(sec);
                    if (!m) { m = new Map(); newUser.set(sec, m); }
                    m.set(k, raw);
                } else {
                    const m = newUser.get(sec);
                    if (m) {
                        m.delete(k);
                        if (m.size === 0) newUser.delete(sec);
                    }
                }
            }
            const before = collectEffectiveRaw(userMap, systemMaps);
            const after = collectEffectiveRaw(newUser, newSystems);
            const changed = [];
            for (const [id, raw] of before) {
                if (!after.has(id) || after.get(id) !== raw) changed.push(id);
            }
            for (const [id] of after) {
                if (!before.has(id)) changed.push(id);
            }
            userMap = newUser;
            systemMaps = newSystems;
            for (let i = 0; i < changed.length; ++i) {
                const sep = changed[i].indexOf('\0');
                const sec = changed[i].slice(0, sep);
                const k = changed[i].slice(sep + 1);
                notifyWatchers(sec, k, getOptional(sec, k));
            }
        }

        if (!changeQueue.length) return;
        const ready = changeQueue;
        changeQueue = [];
        for (let i = 0; i < ready.length; ++i) {
            const chg = ready[i];
            const w = watchers.get(chg.token);
            if (!w) continue;
            const fullKey = chg.path + '/' + chg.key;
            const oldVal = w.previousValues.has(fullKey) ? w.previousValues.get(fullKey) : undefined;
            w.previousValues.set(fullKey, cloneVal(chg.newValue));
            w.callback(chg.key, cloneVal(chg.newValue), cloneVal(oldVal), chg.path);
        }
    });

    // ---- Public API ----
    const ns = mount(globalThis.bro, 'conf');

    ns.get = function get(...args) {
        const pk = parsePathKey(args);
        const val = getOptional(pk.path, pk.key);
        if (val !== undefined) return val;
        throw new Error(`Key '${pk.key}' not found in configuration for path '${pk.path}'`);
    };

    ns.getOptional = function getOptionalFn(...args) {
        const pk = parsePathKey(args);
        return getOptional(pk.path, pk.key);
    };

    ns.set = function set(...args) {
        const parsed = parseSetArgs(args);
        if (!parsed.ok) {
            return Promise.reject(new Error('bro.conf.set requires (key, value) or (path, key, value)'));
        }
        const { path, key, val } = parsed;
        const accessErr = hooks.checkWriteError('set ' + displayKey(path, key) + ' in the desktop settings');
        if (accessErr) return Promise.reject(accessErr);

        const schema = findSchema(path);
        const ks = schema ? schema.keys.get(key) : null;
        let coerced;
        try {
            if (schema && !ks) {
                throw new Error(`ValidationError: Key '${key}' not defined in schema '${schema.id}'`);
            }
            coerced = coerceForSchema(val, ks ? ks.type : undefined);
            if (ks) validateKeySchema(ks, coerced);
        } catch (e) {
            return Promise.reject(e);
        }

        const section = normalizeSection(path);
        const raw = serializeValue(coerced, ks ? ks.type : undefined);
        let uSec = userMap.get(section);
        if (!uSec) { uSec = new Map(); userMap.set(section, uSec); }
        uSec.set(key, raw);

        const ok = hooks.queuePatch(section, key, raw);
        if (!ok) return Promise.reject(new Error(`Failed to set configuration key '${key}'`));

        notifyWatchers(path, key, coerced);
        return Promise.resolve(undefined);
    };

    ns.flush = function flush() {
        return hooks.flush();
    };

    ns.reset = function reset(...args) {
        const pk = parsePathKey(args);
        const accessErr = hooks.checkWriteError('reset ' + displayKey(pk.path, pk.key) + ' in the desktop settings');
        if (accessErr) throw accessErr;

        const section = normalizeSection(pk.path);
        const uSec = userMap.get(section);
        if (uSec && uSec.has(pk.key)) {
            uSec.delete(pk.key);
            if (uSec.size === 0) userMap.delete(section);
            if (!hooks.queuePatch(section, pk.key, null)) return false;
        }
        notifyWatchers(pk.path, pk.key, getOptional(pk.path, pk.key));
        return true;
    };

    ns.has = function has(...args) {
        const pk = parsePathKey(args);
        const section = normalizeSection(pk.path);
        const uSec = userMap.get(section);
        if (uSec && uSec.has(pk.key)) return true;
        for (let i = 0; i < systemMaps.length; ++i) {
            const sSec = systemMaps[i].get(section);
            if (sSec && sSec.has(pk.key)) return true;
        }
        const schema = findSchema(pk.path);
        return !!(schema && schema.keys.has(pk.key));
    };

    ns.isDefault = function isDefault(...args) {
        const pk = parsePathKey(args);
        const section = normalizeSection(pk.path);
        const uSec = userMap.get(section);
        return !(uSec && uSec.has(pk.key));
    };

    ns.listKeys = function listKeys(path) {
        return listKeysFor(path === undefined ? '' : String(path));
    };

    ns.watch = function watch(...args) {
        if (!args.length) throw new TypeError('bro.conf.watch requires (path_or_key, callback)');
        let path = '';
        let key = '';
        let cb = null;
        if (args.length >= 3 && typeof args[2] === 'function') {
            path = String(args[0]);
            key = String(args[1]);
            cb = args[2];
        } else if (args.length >= 2 && typeof args[1] === 'function') {
            const s = String(args[0]);
            cb = args[1];
            const dot = s.lastIndexOf('.');
            if (dot >= 0) {
                const candPath = s.slice(0, dot);
                const candKey = s.slice(dot + 1);
                if (ns.has(candPath, candKey)) {
                    path = candPath;
                    key = candKey;
                } else if (findSchema(s)) {
                    path = s;
                    key = '';
                } else {
                    path = candPath;
                    key = candKey;
                }
            } else {
                path = s;
                key = '';
            }
        } else {
            throw new TypeError('bro.conf.watch requires a callback function');
        }

        const token = nextToken++;
        const previousValues = new Map();
        if (key) {
            const cur = getOptional(path, key);
            if (cur !== undefined) previousValues.set(path + '/' + key, cloneVal(cur));
        } else {
            const ks = listKeysFor(path);
            for (let i = 0; i < ks.length; ++i) {
                const cur = getOptional(path, ks[i]);
                if (cur !== undefined) previousValues.set(path + '/' + ks[i], cloneVal(cur));
            }
        }

        watchers.set(token, { token, path, key, callback: cb, previousValues });
        return {
            token,
            unwatch: () => watchers.delete(token),
        };
    };

    ns.unwatch = function unwatch(tokenOrHandle) {
        if (tokenOrHandle && typeof tokenOrHandle === 'object' && typeof tokenOrHandle.token === 'number') {
            return watchers.delete(tokenOrHandle.token);
        }
        if (typeof tokenOrHandle === 'number') {
            return watchers.delete(tokenOrHandle);
        }
        return false;
    };

    ns.registerSchema = function registerSchema(def) {
        if (!def || typeof def !== 'object') throw new TypeError('registerSchema requires a schema definition object');
        if (typeof def.id !== 'string') throw new TypeError("Schema definition requires a string 'id'");
        const id = def.id;
        const path = typeof def.path === 'string' ? def.path : id;
        const keys = new Map();
        if (def.keys && typeof def.keys === 'object') {
            for (const kn of Object.keys(def.keys)) {
                const kSpec = def.keys[kn];
                if (!kSpec || typeof kSpec !== 'object') continue;
                const kType = typeFromString(typeof kSpec.type === 'string' ? kSpec.type : 'string');
                const defRaw = kSpec.default !== undefined ? kSpec.default : kSpec.defaultValue;
                const minRaw = kSpec.min !== undefined ? kSpec.min : kSpec.minValue;
                const maxRaw = kSpec.max !== undefined ? kSpec.max : kSpec.maxValue;
                const enumRaw = Array.isArray(kSpec.enum) ? kSpec.enum : (Array.isArray(kSpec.allowedValues) ? kSpec.allowedValues : null);
                keys.set(kn, {
                    name: kn,
                    type: kType,
                    defaultValue: defRaw !== undefined ? coerceForSchema(defRaw, kType) : undefined,
                    min: minRaw !== undefined ? Number(minRaw) : undefined,
                    max: maxRaw !== undefined ? Number(maxRaw) : undefined,
                    allowedEnum: enumRaw ? enumRaw.map((x) => String(x)) : null,
                });
            }
        }
        const schema = { id, path, keys };
        schemasById.set(id, schema);
        schemasByPath.set(path, schema);
    };
})();
