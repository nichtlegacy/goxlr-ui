// Helpers for the macOS hotkey bindings (DaemonConfig.macos_hotkeys). Keys are stored as KeyboardEvent.code values.

export const HOTKEY_CHANNELS = ["System", "Game", "Chat", "Music", "Sample"];
export const CHANNEL_ACTIONS = ["VolumeUp", "VolumeDown", "ToggleMute"];
export const FRONTMOST_ACTION = "ToggleFrontmostAppMute";
export const HOTKEY_ACTIONS = [...CHANNEL_ACTIONS, FRONTMOST_ACTION];

// Pressing one of these alone never completes a recording.
const MODIFIER_CODES = new Set([
    "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight",
    "OSLeft", "OSRight", "CapsLock", "Fn", "FnLock",
]);

const KEY_SYMBOLS = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'",
    Comma: ",", Period: ".", Slash: "/", Backquote: "`", IntlBackslash: "§",
    Enter: "↩", Tab: "⇥", Backspace: "⌫", Delete: "⌦", Home: "↖", End: "↘", PageUp: "⇞", PageDown: "⇟",
    NumpadAdd: "+", NumpadSubtract: "-", NumpadMultiply: "*", NumpadDivide: "/", NumpadDecimal: ".",
    NumpadEqual: "=", NumpadEnter: "⌤", NumpadClear: "⌧",
};

// Keys whose symbol a screen reader wouldn't read well, spelled out through message.system.shortcuts.keyNames.
const SPOKEN_KEYS = [
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "Tab", "Backspace", "Delete", "Home", "End",
    "PageUp", "PageDown",
];

export function isModifierCode(code) {
    return MODIFIER_CODES.has(code);
}

// F13-F19 are the only keys macOS users commonly bind without a modifier.
export function isStandaloneKey(code) {
    let match = /^F(\d+)$/.exec(code ?? "");
    return match !== null && parseInt(match[1]) >= 13 && parseInt(match[1]) <= 19;
}

export function hasModifier(modifiers) {
    return !!(modifiers?.command || modifiers?.option || modifiers?.control || modifiers?.shift);
}

export function emptyModifiers() {
    return {command: false, option: false, control: false, shift: false};
}

function isNumpad(code) {
    return code.startsWith("Numpad");
}

export function keyLabel(code, t) {
    if (code === "Space") {
        return t('message.system.shortcuts.keyNames.Space');
    }
    if (KEY_SYMBOLS[code] !== undefined) {
        let symbol = KEY_SYMBOLS[code];
        return isNumpad(code) ? t('message.system.shortcuts.keypad', {key: symbol}) : symbol;
    }
    let match = /^Key([A-Z])$/.exec(code) ?? /^Digit(\d)$/.exec(code);
    if (match !== null) {
        return match[1];
    }
    match = /^Numpad(\d)$/.exec(code);
    if (match !== null) {
        return t('message.system.shortcuts.keypad', {key: match[1]});
    }
    return code;
}

// Mac menu order: ⌃ ⌥ ⇧ ⌘, then the key.
export function comboLabel(code, modifiers, t) {
    let prefix = (modifiers?.control ? "⌃" : "") + (modifiers?.option ? "⌥" : "") +
        (modifiers?.shift ? "⇧" : "") + (modifiers?.command ? "⌘" : "");
    return prefix + keyLabel(code, t);
}

export function comboSpoken(code, modifiers, t) {
    let parts = [];
    for (let name of ["control", "option", "shift", "command"]) {
        if (modifiers?.[name]) {
            parts.push(t(`message.system.shortcuts.modifierNames.${name}`));
        }
    }
    parts.push(SPOKEN_KEYS.includes(code) ? t(`message.system.shortcuts.keyNames.${code}`) : keyLabel(code, t));
    return parts.join(" ");
}

export function comboKey(code, modifiers) {
    return [modifiers?.control ? 1 : 0, modifiers?.option ? 1 : 0, modifiers?.shift ? 1 : 0,
        modifiers?.command ? 1 : 0, code].join(":");
}

// {"VolumeUp": "Chat"} or "ToggleFrontmostAppMute" into {action, channel}. Anything else is kept as is.
export function parseAction(raw) {
    if (raw === FRONTMOST_ACTION) {
        return {action: FRONTMOST_ACTION, channel: "Chat", raw: null};
    }
    if (raw !== null && typeof raw === "object") {
        let keys = Object.keys(raw);
        if (keys.length === 1 && CHANNEL_ACTIONS.includes(keys[0]) && HOTKEY_CHANNELS.includes(raw[keys[0]])) {
            return {action: keys[0], channel: raw[keys[0]], raw: null};
        }
    }
    return {action: null, channel: "Chat", raw};
}

export function serializeAction(row) {
    if (row.action === null) {
        return row.raw;
    }
    if (row.action === FRONTMOST_ACTION) {
        return FRONTMOST_ACTION;
    }
    return {[row.action]: row.channel};
}
