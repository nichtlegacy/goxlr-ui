<template>
  <li class="shortcutRow" :aria-label="rowLabel">
    <div class="action">
      <select :id="`${idPrefix}_action`" :aria-label="$t('message.system.shortcuts.actionFor', { row: rowLabel })"
              @change="onActionChange">
        <option v-if="row.action === null" value="" selected>{{ $t('message.system.shortcuts.unknownAction') }}</option>
        <option v-for="action in actions" :key="action" :value="action" :selected="row.action === action">
          {{ $t(`message.system.shortcuts.actions.${action}`) }}
        </option>
      </select>
    </div>

    <div class="channel">
      <select v-if="showChannel" :aria-label="$t('message.system.shortcuts.channelFor', { row: rowLabel })"
              @change="$emit('change', row.id, { channel: $event.target.value })">
        <option v-for="channel in channels" :key="channel" :value="channel" :selected="row.channel === channel">
          {{ $t(`message.channels.${channel}`) }}
        </option>
      </select>
    </div>

    <div class="combo" :class="{ recording, unset: !recording && row.code === null, invalid: error !== null }"
         aria-hidden="true">
      <span v-if="recording">{{ $t('message.system.shortcuts.pressKeys') }}</span>
      <span v-else-if="row.code === null">{{ $t('message.system.shortcuts.unassigned') }}</span>
      <span v-else>{{ combo }}</span>
    </div>
    <span class="visuallyHidden">{{ comboSpokenText }}</span>

    <button :id="`${idPrefix}_record`" ref="recordButton" class="textButton record" :class="{ active: recording }"
            :aria-pressed="recording" :aria-describedby="error !== null ? `${idPrefix}_error` : undefined"
            :aria-label="recordLabel"
            @click="$emit(recording ? 'cancel-record' : 'record', row.id)"
            @blur="onRecordBlur">
      {{ recording ? $t('message.system.shortcuts.recording') : $t('message.system.shortcuts.record') }}
    </button>

    <button :id="`${idPrefix}_remove`" class="iconButton remove"
            :aria-label="$t('message.system.shortcuts.remove', { row: rowLabel })"
            :title="$t('message.system.shortcuts.remove', { row: rowLabel })"
            @click="$emit('remove', row.id)">
      <font-awesome-icon icon="fa-solid fa-trash"/>
    </button>

    <p v-if="error !== null" :id="`${idPrefix}_error`" class="validation" :class="error">
      {{ errorText }}
    </p>
  </li>
</template>

<script>
import {
  comboLabel, comboSpoken, FRONTMOST_ACTION, HOTKEY_ACTIONS, HOTKEY_CHANNELS, isModifierCode
} from "@/util/hotkeys";

export default {
  name: "ShortcutRow",
  emits: ["change", "record", "cancel-record", "recorded", "remove"],

  props: {
    row: {type: Object, required: true},
    // 1-based position, used for labels.
    position: {type: Number, required: true},
    recording: {type: Boolean, required: false, default: false},
    // null, "modifier", "key", "duplicate" or "duplicateRejected".
    error: {type: String, required: false, default: null},
    duplicateOf: {type: Number, required: false, default: null},
  },

  computed: {
    idPrefix() {
      return `shortcut_${this.row.id}`;
    },

    actions() {
      return HOTKEY_ACTIONS;
    },

    channels() {
      return HOTKEY_CHANNELS;
    },

    showChannel() {
      return this.row.action !== null && this.row.action !== FRONTMOST_ACTION;
    },

    rowLabel() {
      return this.$t('message.system.shortcuts.rowLabel', {position: this.position});
    },

    combo() {
      return comboLabel(this.row.code, this.row.modifiers, this.$t);
    },

    comboSpokenText() {
      if (this.row.code === null) {
        return this.$t('message.system.shortcuts.unassigned');
      }
      return comboSpoken(this.row.code, this.row.modifiers, this.$t);
    },

    recordLabel() {
      if (this.recording) {
        return this.$t('message.system.shortcuts.recordingFor', {row: this.rowLabel});
      }
      return this.$t('message.system.shortcuts.recordFor', {row: this.rowLabel, combo: this.comboSpokenText});
    },

    errorText() {
      if (this.error === "modifier") {
        return this.$t('message.system.shortcuts.needsModifier');
      }
      if (this.error === "key") {
        return this.$t('message.system.shortcuts.unsupportedKey');
      }
      if (this.error === "duplicate" || this.error === "duplicateRejected") {
        return this.$t(`message.system.shortcuts.${this.error}`, {position: this.duplicateOf});
      }
      return "";
    },
  },

  methods: {
    onActionChange(e) {
      if (e.target.value !== "") {
        this.$emit("change", this.row.id, {action: e.target.value, raw: null});
      }
    },

    onKeyDown(e) {
      // Swallow everything while recording, so the combination doesn't also trigger the page or the browser.
      e.preventDefault();
      e.stopPropagation();

      if (e.repeat || isModifierCode(e.code) || e.code === "") {
        return;
      }
      if (e.code === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        this.$emit("cancel-record", this.row.id);
        return;
      }
      this.$emit("recorded", this.row.id, e.code, {
        command: e.metaKey, option: e.altKey, control: e.ctrlKey, shift: e.shiftKey,
      });
    },

    // Keyup of the recorded key (or Enter / Space on the button) shouldn't click anything either.
    onKeyUp(e) {
      e.preventDefault();
      e.stopPropagation();
    },

    onRecordBlur() {
      if (this.recording) {
        this.$emit("cancel-record", this.row.id);
      }
    },

    attach() {
      window.addEventListener("keydown", this.onKeyDown, true);
      window.addEventListener("keyup", this.onKeyUp, true);
    },

    detach() {
      window.removeEventListener("keydown", this.onKeyDown, true);
      window.removeEventListener("keyup", this.onKeyUp, true);
    },

    focus(part) {
      document.getElementById(`${this.idPrefix}_${part}`)?.focus();
    },
  },

  watch: {
    recording(value) {
      if (value) {
        this.attach();
        this.$refs.recordButton?.focus();
      } else {
        // Detach after the current event, so the keyup finishing a recording is still swallowed.
        setTimeout(this.detach, 0);
      }
    },
  },

  unmounted() {
    this.detach();
  },
}
</script>

<style scoped>
.shortcutRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 14px;
  row-gap: 6px;

  padding: 8px 12px;
  color: #ccc;
  list-style: none;
}

.shortcutRow:focus-within {
  color: #fff;
}

/* Fixed select columns keep the key fields lined up from row to row. */
.action {
  flex: 0 0 230px;
}

.channel {
  flex: 0 0 130px;
}

select {
  width: 100%;
  border: 0;
  background-color: transparent;
  font-family: LeagueMonoCondensed, sans-serif;
  font-size: 1em;
  color: #ccc;
}

select:hover {
  color: #fff;
  cursor: pointer;
}

select option {
  background-color: #2F2F2F;
}

.combo {
  flex: 1 1 110px;
  min-width: 90px;
  box-sizing: border-box;
  height: 32px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  border: 1px solid transparent;

  /* Darker than both alternating row colours. */
  background-color: #151817;
  color: #fff;
  font-family: LeagueMonoCondensed, sans-serif;
  font-size: 1.1em;
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
}

.combo.unset {
  color: #959796;
  font-size: 1em;
  letter-spacing: normal;
}

.combo.recording {
  border-color: #59b1b6;
  color: #59b1b6;
  font-size: 1em;
  letter-spacing: normal;
}

.combo.invalid {
  border-color: #d0c060;
}

.textButton {
  white-space: nowrap;
  border: 1px solid #CCCCCC;
  background-color: transparent;
  color: #ccc;
  padding: 3px 8px;
  cursor: pointer;
}

.textButton:hover,
.textButton:focus-visible {
  border: 1px solid #fff;
  color: #fff;
}

.textButton.active {
  border-color: #59b1b6;
  background-color: #59b1b6;
  color: #353937;
}

.record {
  min-width: 90px;
}

.iconButton {
  width: 32px;
  height: 32px;
  border: 0;
  padding: 0;
  background-color: #3b413f;
  color: #fff;
  cursor: pointer;
}

.iconButton:hover,
.iconButton:focus-visible {
  background-color: #49514e;
}

.validation {
  flex: 1 0 100%;
  margin: 0;
  color: #d0c060;
  font-size: 0.9em;
}

.visuallyHidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
