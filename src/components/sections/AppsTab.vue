<template>
  <div class="appsPage">
    <GroupContainer :title="$t('message.apps.title')">
      <div class="appList" ref="list" tabindex="-1">
        <p v-for="mixer in mixers" :key="mixer" class="notice" role="note">
          {{ $t('message.apps.mixerNotice', { app: mixer }) }}
        </p>
        <p v-if="entries.length === 0" class="empty">{{ $t('message.apps.empty') }}</p>
        <ul v-else class="rows" :aria-label="$t('message.apps.accessibilityList')">
          <AppRow v-for="entry in entries" :key="entry.bundle_id"
                  :entry="entry"
                  :rule="effectiveRule(entry.bundle_id)"
                  :level="levels[entry.bundle_id] || 0"
                  :route-options="getRouteOptions(effectiveRule(entry.bundle_id).route)"
                  :own-output-label="getOwnOutputLabel(entry)"
                  :menu-button-id="getMenuButtonId(entry.bundle_id)"
                  @change="updateRule"
                  @open-menu="openMenu"
          />
        </ul>

        <!-- Apps coreaudiod knows about but that are silent and have no rule, so they can be
             assigned an output before they start playing without crowding the list. -->
        <details v-if="otherEntries.length > 0" class="hiddenApps otherApps">
          <summary>{{ $t('message.apps.otherApps', { count: otherEntries.length }) }}</summary>
          <ul class="rows" :aria-label="$t('message.apps.otherAppsList')">
            <AppRow v-for="entry in otherEntries" :key="entry.bundle_id"
                    :entry="entry"
                    :rule="effectiveRule(entry.bundle_id)"
                    :level="levels[entry.bundle_id] || 0"
                    :route-options="getRouteOptions(effectiveRule(entry.bundle_id).route)"
                    :own-output-label="getOwnOutputLabel(entry)"
                    :menu-button-id="getMenuButtonId(entry.bundle_id)"
                    @change="updateRule"
                    @open-menu="openMenu"
            />
          </ul>
        </details>

        <DropMenu :options="menuOptions" ref="contextMenu" menu_id="app_menu" @option-clicked="onMenuOption"/>

        <details v-if="hiddenApps.length > 0" class="hiddenApps">
          <summary ref="hiddenSummary">{{ $t('message.apps.hiddenApps', { count: hiddenApps.length }) }}</summary>
          <ul :aria-label="$t('message.apps.hiddenAppsList')">
            <li v-for="app in hiddenApps" :key="app.bundle_id" class="hiddenRow">
              <div class="identity">
                <span class="name">{{ app.name }}</span>
                <span v-if="app.name !== app.bundle_id" class="hint">{{ app.bundle_id }}</span>
              </div>
              <button class="textButton" :aria-label="$t('message.apps.unhideApp', { app: app.name })"
                      @click="unhide(app)">
                {{ $t('message.apps.unhide') }}
              </button>
            </li>
          </ul>
        </details>
      </div>
    </GroupContainer>
  </div>
</template>

<script>
import GroupContainer from "@/components/containers/GroupContainer.vue";
import DropMenu from "@/components/design/DropMenu.vue";
import AppRow from "@/components/sections/apps/AppRow.vue";
import {store} from "@/store";
import {websocket} from "@/util/sockets";

// Playback routes 0-4, in the order the daemon indexes them. Route n is enabled when bit (12 + n) is set.
const PLAYBACK_ROUTES = ["systemOutput", "gameOutput", "chatOutput", "musicOutput", "sampleOutput"];
const PLAYBACK_ROUTE_BIT = 12;

const DEFAULT_RULE = Object.freeze({route: null, volume: 100, muted: false});

// How long a settled draft may wait for the matching status patch before we fall back to the store.
const DRAFT_EXPIRY = 1500;

export default {
  name: "AppsTab",
  components: {AppRow, DropMenu, GroupContainer},

  data() {
    return {
      // Per-field overrides we've just sent ({fields, pending, timer}), so the controls don't jump back while the
      // daemon catches up. Only touched fields are kept, everything else comes from the stored rule.
      drafts: {},

      levels: {},
      poll_rate: 100,
      poll_timeout: 1000,
      poll_error_delay: 1000,
      poll_timer: undefined,
      poll_in_flight: false,
      polling: false,

      page_visible: document.visibilityState === "visible",
      page_focused: document.hasFocus(),

      menuOptions: [],
      restoreFocus: false,
      restoreFocusTimer: undefined,
    }
  },

  computed: {
    appAudio() {
      return store.getConfig()?.macos_app_audio;
    },

    // Per-app mixers such as FineTune replay the apps they control from their own process.
    mixers() {
      return this.appAudio?.mixers ?? [];
    },

    hiddenIds() {
      return this.appAudio?.hidden ?? [];
    },

    rules() {
      return this.appAudio?.rules ?? {};
    },

    runningApps() {
      return (this.appAudio?.apps ?? []).filter((app) => !this.hiddenIds.includes(app.bundle_id));
    },

    entries() {
      let running = this.runningApps.map((app) => ({
        bundle_id: app.bundle_id,
        name: app.name || this.getName(app.bundle_id),
        running: true,
        playing: app.playing,
        device_route: app.device_route,
      })).sort((a, b) => (b.playing - a.playing) || a.name.localeCompare(b.name));

      let runningIds = running.map((app) => app.bundle_id);
      let saved = Object.keys(this.rules)
          .filter((id) => !runningIds.includes(id) && !this.hiddenIds.includes(id))
          .map((id) => ({
            bundle_id: id,
            name: this.getName(id),
            running: false,
            playing: false,
            device_route: null,
          })).sort((a, b) => a.name.localeCompare(b.name));

      // Silent apps without a rule are listed separately in otherEntries.
      return running.filter((app) => app.playing || this.rules[app.bundle_id] !== undefined)
          .concat(saved);
    },

    otherEntries() {
      let listed = this.entries.map((app) => app.bundle_id);
      return this.runningApps
          .filter((app) => !listed.includes(app.bundle_id))
          .map((app) => ({
            bundle_id: app.bundle_id,
            name: app.name || this.getName(app.bundle_id),
            running: true,
            playing: false,
            device_route: app.device_route,
          })).sort((a, b) => a.name.localeCompare(b.name));
    },

    hiddenApps() {
      return this.hiddenIds.map((id) => ({bundle_id: id, name: this.getName(id)}))
          .sort((a, b) => a.name.localeCompare(b.name));
    },

    shouldPoll() {
      return this.page_visible && this.page_focused && this.runningApps.length > 0;
    },
  },

  methods: {
    getName(bundle_id) {
      let app = (this.appAudio?.apps ?? []).find((app) => app.bundle_id === bundle_id);
      return app?.name || this.appAudio?.names?.[bundle_id] || bundle_id;
    },

    getRouteName(index) {
      return this.$t(`message.system.settings.virtualAudioRouteNames.${PLAYBACK_ROUTES[index]}`);
    },

    isRouteEnabled(index) {
      let mask = this.appAudio?.routes;
      if (!Number.isInteger(mask)) {
        return true;
      }
      return (mask & (1 << (PLAYBACK_ROUTE_BIT + index))) !== 0;
    },

    getRouteOptions(current) {
      let options = [];
      for (let index = 0; index < PLAYBACK_ROUTES.length; index++) {
        if (this.isRouteEnabled(index)) {
          options.push({index, label: this.getRouteName(index)});
        } else if (index === current) {
          // Keep a rule pointing at a hidden device visible, rather than silently showing something else.
          options.push({index, label: this.$t('message.apps.routeDisabled', {route: this.getRouteName(index)})});
        }
      }
      return options;
    },

    getOwnOutputLabel(entry) {
      if (!entry.running) {
        return this.$t('message.apps.ownOutputUnknown');
      }
      let device = (entry.device_route === null || entry.device_route === undefined)
          ? this.$t('message.apps.notGoXLR')
          : this.getRouteName(entry.device_route);
      return this.$t('message.apps.ownOutput', {device});
    },

    getMenuButtonId(bundle_id) {
      return "app_menu_" + bundle_id.replace(/[^A-Za-z0-9_-]/g, "_");
    },

    effectiveRule(bundle_id) {
      let stored = this.rules[bundle_id] ?? DEFAULT_RULE;
      let draft = this.drafts[bundle_id];
      return draft === undefined ? stored : {...stored, ...draft.fields};
    },

    updateRule(bundle_id, change) {
      let draft = this.drafts[bundle_id];
      if (draft === undefined) {
        draft = {fields: {}, pending: 0, timer: undefined};
        this.drafts[bundle_id] = draft;
      }
      draft = this.drafts[bundle_id];
      draft.fields = {...draft.fields, ...change};
      draft.pending++;
      clearTimeout(draft.timer);

      // Built on the latest stored rule, so a mute from the tray or a hotkey isn't sent back undone.
      let rule = this.effectiveRule(bundle_id);

      let finish = () => {
        let current = this.drafts[bundle_id];
        if (current === undefined || --current.pending !== 0) {
          return;
        }
        this.pruneDrafts();
        if (this.drafts[bundle_id] !== undefined) {
          current.timer = setTimeout(() => {
            if (this.drafts[bundle_id] === current && current.pending === 0) {
              delete this.drafts[bundle_id];
            }
          }, DRAFT_EXPIRY);
        }
      };

      websocket.send_daemon_command({
        "SetMacOSAppRule": [bundle_id, rule.route, rule.volume, rule.muted]
      }).then(finish, finish);
    },

    // Drop draft fields the store has caught up with. Once our writes have settled, a field the daemon changed
    // since the last look (tray, hotkey..) wins over the draft too.
    pruneDrafts() {
      let previous = this.lastRules;
      this.lastRules = JSON.parse(JSON.stringify(this.rules));

      for (let id of Object.keys(this.drafts)) {
        let draft = this.drafts[id];
        let stored = this.rules[id] ?? DEFAULT_RULE;
        let before = previous[id] ?? DEFAULT_RULE;
        for (let field of Object.keys(draft.fields)) {
          let changed = stored[field] !== before[field];
          if (stored[field] === draft.fields[field] || (changed && draft.pending === 0)) {
            delete draft.fields[field];
          }
        }
        if (draft.pending === 0 && Object.keys(draft.fields).length === 0) {
          clearTimeout(draft.timer);
          delete this.drafts[id];
        }
      }
    },

    discardDraft(bundle_id) {
      let draft = this.drafts[bundle_id];
      if (draft !== undefined) {
        clearTimeout(draft.timer);
        delete this.drafts[bundle_id];
      }
    },

    openMenu(event, entry, return_id) {
      let options = [{name: this.$t('message.apps.hide'), action: "hide"}];
      if (this.rules[entry.bundle_id] !== undefined || this.drafts[entry.bundle_id] !== undefined) {
        options.push({name: this.$t('message.apps.reset'), action: "reset"});
      }
      this.menuOptions = options;

      // Let the menu pick up the options for this row before it measures and focuses itself.
      this.$nextTick(() => this.$refs.contextMenu.showMenu(event, entry, return_id));
    },

    onMenuOption(event) {
      let entry = event.item;
      if (event.option.action === "hide") {
        this.discardDraft(entry.bundle_id);
        this.expectRowRemoval();
        websocket.send_daemon_command({"SetMacOSAppHidden": [entry.bundle_id, true]});
        store.setAccessibilityNotification("polite", this.$t('message.apps.hiddenAnnouncement', {app: entry.name}));
      } else if (event.option.action === "reset") {
        this.discardDraft(entry.bundle_id);
        if (!entry.running) {
          this.expectRowRemoval();
        }
        websocket.send_daemon_command({"RemoveMacOSAppRule": entry.bundle_id});
        store.setAccessibilityNotification("polite", this.$t('message.apps.resetAnnouncement', {app: entry.name}));
      }
    },

    unhide(app) {
      this.expectRowRemoval();
      websocket.send_daemon_command({"SetMacOSAppHidden": [app.bundle_id, false]});
      store.setAccessibilityNotification("polite", this.$t('message.apps.unhiddenAnnouncement', {app: app.name}));
    },

    // When the focused row goes away, keep keyboard users in the list instead of dropping them on the page body.
    expectRowRemoval() {
      this.restoreFocus = true;
      clearTimeout(this.restoreFocusTimer);
      this.restoreFocusTimer = setTimeout(() => this.restoreFocus = false, 2000);
    },

    restoreFocusIfLost() {
      if (!this.restoreFocus) {
        return;
      }
      this.$nextTick(() => {
        let active = document.activeElement;
        if (active === null || active === document.body || !document.body.contains(active)) {
          let target = this.$refs.hiddenSummary ?? this.$refs.list;
          if (this.hiddenApps.length === 0 || target === undefined) {
            target = this.$refs.list;
          }
          target?.focus();
          this.restoreFocus = false;
        }
      });
    },

    onVisibilityChange() {
      this.page_visible = document.visibilityState === "visible";
    },

    onWindowFocus() {
      this.page_focused = true;
    },

    onWindowBlur() {
      this.page_focused = false;
    },

    startPolling() {
      this.polling = true;
      // Only ever run a single poll chain, if a request is in flight it will schedule the next one.
      if (!this.poll_in_flight && this.poll_timer === undefined) {
        this.pollLevels();
      }
    },

    stopPolling() {
      this.polling = false;
      clearTimeout(this.poll_timer);
      this.poll_timer = undefined;
      this.levels = {};
    },

    pollLevels() {
      this.poll_timer = undefined;
      if (!this.polling || this.poll_in_flight) {
        return;
      }
      this.poll_in_flight = true;

      // If a reply gets lost, don't wait on it forever, just carry on polling.
      let timeout;
      let timeout_promise = new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject("App Level Timeout"), this.poll_timeout);
      });

      let delay = this.poll_rate;
      Promise.race([websocket.get_app_levels(), timeout_promise]).then((data) => {
        if (!this.polling) {
          return;
        }
        let incoming = data["MacOSAppLevels"] ?? {};
        let levels = {};
        for (let id of new Set([...Object.keys(this.levels), ...Object.keys(incoming)])) {
          // Peaks reset on every read, so let the bar fall back gently rather than flicker.
          let value = Math.max(incoming[id] ?? 0, (this.levels[id] ?? 0) * 0.6);
          if (value > 0.001) {
            levels[id] = value;
          }
        }
        this.levels = levels;
      }).catch(() => {
        // Timed out, or the daemon doesn't know the request, back off a little before trying again.
        delay = this.poll_error_delay;
      }).finally(() => {
        clearTimeout(timeout);
        this.poll_in_flight = false;
        if (this.polling) {
          this.poll_timer = setTimeout(this.pollLevels, delay);
        }
      });
    },
  },

  watch: {
    shouldPoll: {
      handler(value) {
        if (value) {
          this.startPolling();
        } else {
          this.stopPolling();
        }
      },
      immediate: true,
    },

    rules: {
      handler() {
        this.pruneDrafts();
      },
      deep: true,
    },

    entries() {
      this.restoreFocusIfLost();
    },

    hiddenIds() {
      this.restoreFocusIfLost();
    },
  },

  created() {
    // Not reactive, only used to spot which rule fields a status update changed.
    this.lastRules = JSON.parse(JSON.stringify(this.rules));
  },

  mounted() {
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("focus", this.onWindowFocus);
    window.addEventListener("blur", this.onWindowBlur);
  },

  unmounted() {
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("focus", this.onWindowFocus);
    window.removeEventListener("blur", this.onWindowBlur);

    this.stopPolling();
    clearTimeout(this.restoreFocusTimer);
    for (let id of Object.keys(this.drafts)) {
      clearTimeout(this.drafts[id].timer);
    }
  },
}
</script>

<style scoped>
.appsPage {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.appList {
  /* The page, tab and group padding add up to roughly 140px around the list. */
  width: min(900px, calc(100vw - 140px));
  position: relative;
  outline: none;
}

.rows,
.hiddenApps ul {
  margin: 0;
  padding: 0;
}

.rows > :nth-child(odd),
.hiddenApps li:nth-child(odd) {
  background-color: #353937;
}

.rows > :nth-child(even),
.hiddenApps li:nth-child(even) {
  background-color: #242826;
}

.notice {
  margin: 0 0 10px 0;
  padding: 10px 14px;
  border-left: 3px solid #d0c060;
  background-color: #242826;
  color: #ccc;
  line-height: 1.4;
}

.empty {
  margin: 0;
  padding: 20px 10px;
  color: #ccc;
  text-align: center;
  white-space: pre-line;
}

.hiddenApps {
  margin-top: 15px;
}

.hiddenApps > summary {
  padding: 10px;
  color: #ccc;
  cursor: pointer;
}

.hiddenApps > summary:hover,
.hiddenApps > summary:focus-visible {
  color: #fff;
}

.hiddenRow {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  color: #ccc;
  list-style: none;
}

.hiddenRow .identity {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.hiddenRow .name {
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hiddenRow .hint {
  color: #959796;
  font-size: 0.9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
