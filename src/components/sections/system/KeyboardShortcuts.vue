<template>
  <GroupContainer :title="$t('message.system.shortcuts.title')">
    <div class="shortcuts" ref="list" tabindex="-1">
      <p class="explanation">{{ $t('message.system.shortcuts.explanation') }}</p>

      <p v-if="rows.length === 0" class="empty">{{ $t('message.system.shortcuts.empty') }}</p>
      <ul v-else class="rows" :aria-label="$t('message.system.shortcuts.accessibilityList')">
        <ShortcutRow v-for="(row, index) in rows" :key="row.id" :ref="(el) => setRowRef(row.id, el)"
                     :row="row"
                     :position="index + 1"
                     :recording="recordingId === row.id"
                     :error="validation[row.id].error"
                     :duplicate-of="validation[row.id].duplicateOf"
                     @change="updateRow"
                     @record="startRecording"
                     @cancel-record="cancelRecording"
                     @recorded="onRecorded"
                     @remove="removeRow"
        />
      </ul>

      <div class="footer">
        <button ref="addButton" class="textButton" @click="addRow">{{ $t('message.system.shortcuts.add') }}</button>
      </div>
    </div>
  </GroupContainer>
</template>

<script>
import GroupContainer from "@/components/containers/GroupContainer.vue";
import ShortcutRow from "@/components/sections/system/shortcuts/ShortcutRow.vue";
import {store} from "@/store";
import {websocket} from "@/util/sockets";
import {
  comboKey, comboSpoken, emptyModifiers, hasModifier, isStandaloneKey, parseAction, serializeAction
} from "@/util/hotkeys";

function normalizeModifiers(modifiers) {
  return {
    command: !!modifiers?.command,
    option: !!modifiers?.option,
    control: !!modifiers?.control,
    shift: !!modifiers?.shift,
  };
}

function toBinding(row) {
  return {action: serializeAction(row), code: row.code, modifiers: normalizeModifiers(row.modifiers)};
}

function canonical(bindings) {
  return JSON.stringify(bindings.map((binding) => ({
    action: binding.action,
    code: binding.code,
    modifiers: normalizeModifiers(binding.modifiers),
  })));
}

export default {
  name: "KeyboardShortcuts",
  components: {ShortcutRow, GroupContainer},

  data() {
    return {
      // Local rows, including ones that aren't sent yet (no key, missing modifier or duplicate).
      rows: [],
      nextId: 1,
      recordingId: null,

      pendingWrites: 0,
      revision: 0,
      rowRefs: {},
    }
  },

  computed: {
    configHotkeys() {
      return store.getConfig()?.macos_hotkeys;
    },

    // id -> {error, duplicateOf, sendable}. The first of several identical combinations wins.
    validation() {
      let result = {};
      let seen = new Map();
      this.rows.forEach((row, index) => {
        let state = {error: null, duplicateOf: null, sendable: false};
        if (row.code !== null) {
          let key = comboKey(row.code, row.modifiers);
          if (!hasModifier(row.modifiers) && !isStandaloneKey(row.code)) {
            state.error = "modifier";
          } else if (seen.has(key)) {
            state.error = "duplicate";
            state.duplicateOf = seen.get(key) + 1;
          } else {
            seen.set(key, index);
            state.sendable = true;
          }
        }
        result[row.id] = state;
      });
      return result;
    },

    payload() {
      return this.rows.filter((row) => this.validation[row.id].sendable).map(toBinding);
    },
  },

  methods: {
    setRowRef(id, el) {
      if (el) {
        this.rowRefs[id] = el;
      } else {
        delete this.rowRefs[id];
      }
    },

    newRow(fields) {
      return {
        id: this.nextId++,
        action: "VolumeUp",
        channel: "Chat",
        raw: null,
        code: null,
        modifiers: emptyModifiers(),
        ...fields,
      };
    },

    // Rebuild from the daemon's list, keeping rows that only exist locally at the end.
    syncFromConfig() {
      let bindings = Array.isArray(this.configHotkeys) ? this.configHotkeys : [];
      let unused = this.rows.filter((row) => this.validation[row.id]?.sendable);
      let localOnly = this.rows.filter((row) => !this.validation[row.id]?.sendable);

      this.rows = bindings.map((binding) => {
        let parsed = parseAction(binding.action);
        let modifiers = normalizeModifiers(binding.modifiers);
        let fields = {...parsed, code: binding.code ?? null, modifiers};

        // Hold on to the row id where we can, so focus and recording aren't lost on a resync.
        let key = JSON.stringify(toBinding({...fields}));
        let index = unused.findIndex((row) => JSON.stringify(toBinding(row)) === key);
        if (index !== -1) {
          let row = unused.splice(index, 1)[0];
          return {...row, ...fields};
        }
        return this.newRow(fields);
      }).concat(localOnly);

      if (this.recordingId !== null && !this.rows.some((row) => row.id === this.recordingId)) {
        this.recordingId = null;
      }
    },

    getRow(id) {
      return this.rows.find((row) => row.id === id);
    },

    commit() {
      let payload = this.payload;
      let current = Array.isArray(this.configHotkeys) ? this.configHotkeys : [];
      if (this.pendingWrites === 0 && canonical(payload) === canonical(current)) {
        return;
      }

      this.revision++;
      this.pendingWrites++;

      let finish = (failed) => {
        if (failed) {
          store.setAccessibilityNotification("assertive", this.$t('message.system.shortcuts.saveFailed'));
        }
        if (--this.pendingWrites !== 0) {
          return;
        }
        let revision = this.revision;
        let settle = () => {
          if (this.pendingWrites === 0 && this.revision === revision) {
            this.syncFromConfig();
          }
        };
        websocket.get_status().then((status) => {
          if (this.pendingWrites === 0 && this.revision === revision) {
            store.replaceData(status);
          }
          settle();
        }, settle);
      };

      websocket.send_daemon_command({"SetMacOSHotkeys": payload}).then(() => finish(false), () => finish(true));
    },

    updateRow(id, change) {
      let row = this.getRow(id);
      if (row === undefined) {
        return;
      }
      Object.assign(row, change);
      this.commit();
    },

    addRow() {
      let row = this.newRow({});
      this.rows.push(row);
      store.setAccessibilityNotification("polite", this.$t('message.system.shortcuts.addedAnnouncement'));
      this.$nextTick(() => this.rowRefs[row.id]?.focus("action"));
    },

    removeRow(id) {
      let index = this.rows.findIndex((row) => row.id === id);
      if (index === -1) {
        return;
      }
      if (this.recordingId === id) {
        this.recordingId = null;
      }
      this.rows.splice(index, 1);
      store.setAccessibilityNotification("polite", this.$t('message.system.shortcuts.removedAnnouncement'));
      this.commit();

      // Keep keyboard users in the list, on the remove button that took this row's place.
      this.$nextTick(() => {
        let next = this.rows[Math.min(index, this.rows.length - 1)];
        if (next !== undefined) {
          this.rowRefs[next.id]?.focus("remove");
        } else {
          this.$refs.addButton?.focus();
        }
      });
    },

    startRecording(id) {
      this.recordingId = id;
      store.setAccessibilityNotification("polite", this.$t('message.system.shortcuts.recordingAnnouncement'));
    },

    cancelRecording(id) {
      if (this.recordingId === id) {
        this.recordingId = null;
        store.setAccessibilityNotification("polite", this.$t('message.system.shortcuts.cancelledAnnouncement'));
      }
    },

    onRecorded(id, code, modifiers) {
      let row = this.getRow(id);
      this.recordingId = null;
      if (row === undefined) {
        return;
      }
      row.code = code;
      row.modifiers = normalizeModifiers(modifiers);

      let state = this.validation[id];
      let combo = comboSpoken(code, row.modifiers, this.$t);
      if (state.error === "modifier") {
        store.setAccessibilityNotification("assertive", this.$t('message.system.shortcuts.needsModifier'));
      } else if (state.error === "duplicate") {
        store.setAccessibilityNotification("assertive",
            this.$t('message.system.shortcuts.duplicate', {position: state.duplicateOf}));
      } else {
        store.setAccessibilityNotification("polite", this.$t('message.system.shortcuts.setAnnouncement', {combo}));
      }
      this.commit();
    },
  },

  watch: {
    configHotkeys: {
      handler() {
        if (this.pendingWrites !== 0) {
          return;
        }
        let current = Array.isArray(this.configHotkeys) ? this.configHotkeys : [];
        if (canonical(current) !== canonical(this.payload)) {
          this.syncFromConfig();
        }
      },
      deep: true,
    },
  },

  mounted() {
    this.syncFromConfig();
  },
}
</script>

<style scoped>
.shortcuts {
  /* Same width budget as the Apps page. */
  width: min(900px, calc(100vw - 140px));
  outline: none;
}

.explanation {
  margin: 0 0 10px;
  color: #ccc;
  text-align: center;
}

.rows {
  margin: 0;
  padding: 0;
}

.rows > :nth-child(odd) {
  background-color: #353937;
}

.rows > :nth-child(even) {
  background-color: #242826;
}

.empty {
  margin: 0;
  padding: 20px 10px;
  color: #959796;
  text-align: center;
  background-color: #353937;
}

.footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
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
</style>
