<template>
  <li class="appRow" :class="{ notRunning: !entry.running }" :aria-label="entry.name">
    <div class="identity" :title="entry.bundle_id">
      <span class="name">{{ entry.name }}</span>
      <span v-if="!entry.running" class="hint">{{ $t('message.apps.notRunning') }}</span>
    </div>

    <div class="meter" aria-hidden="true">
      <div class="meterFill" :style="{ width: meterWidth }"></div>
    </div>

    <div class="output">
      <select :aria-label="$t('message.apps.output', { app: entry.name })" @change="onRouteChange">
        <option value="" :selected="rule.route === null">{{ ownOutputLabel }}</option>
        <option v-for="route in routeOptions" :key="route.index" :value="route.index"
                :selected="rule.route === route.index">
          {{ route.label }}
        </option>
      </select>
    </div>

    <div class="volume" role="group" :aria-label="$t('message.apps.volume', { app: entry.name })"
         @wheel.prevent="onWheel">
      <div class="rangeBox">
        <RangeSelector
            :store-path="storePath"
            :min-value="0"
            :max-value="200"
            :current-field-value="shownVolume"
            :title="$t('message.apps.volume', { app: entry.name })"
            :reported-value="volume + $t('message.suffixes.percentage')"
            :needs-rotation="false"
            :height="rangeWidth"
            colour="#59b1b6"
            background-colour="#151817"
            @value-updated="onRangeInput"
            @mouse-down="onRangeDown"
            @mouse-up="onRangeUp"
        />
        <!-- The thumb travels from 8px to width - 8px, so 100 % (half of 0-200) always sits dead centre. -->
        <div class="unity" aria-hidden="true" :title="$t('message.apps.volumeUnity')">
          <span class="tick"></span>
          <span class="tickLabel">100</span>
        </div>
      </div>
      <TextInput class="volumeInput" :current-text-value="shownVolume" :min-value="0" :max-value="200"
                 :text-suffix="$t('message.suffixes.percentage')" :editable="true"
                 :title="$t('message.apps.volume', { app: entry.name })" colour="#59b1b6"
                 @value-updated="onTextInput"/>
    </div>

    <button class="iconButton mute" :class="{ active: rule.muted }" :aria-pressed="rule.muted"
            :aria-label="$t('message.apps.mute', { app: entry.name })"
            :title="$t('message.apps.mute', { app: entry.name })" @click="toggleMute">
      <font-awesome-icon v-if="rule.muted" icon="fa-solid fa-volume-xmark"/>
      <font-awesome-icon v-else icon="fa-solid fa-volume-high"/>
    </button>

    <button :id="menuButtonId" class="iconButton menu" aria-haspopup="menu" aria-controls="app_menu"
            :aria-label="$t('message.apps.menu', { app: entry.name })"
            :title="$t('message.apps.menu', { app: entry.name })"
            @click.prevent.stop="$emit('open-menu', $event, entry, menuButtonId)">
      <font-awesome-icon icon="fa-solid fa-ellipsis-vertical"/>
    </button>
  </li>
</template>

<script>
import RangeSelector from "@/components/slider/components/Range.vue";
import TextInput from "@/components/slider/components/Input.vue";

// Minimum gap between volume commands while the slider is being dragged or scrolled.
const VOLUME_THROTTLE = 50;
const WHEEL_STEP = 5;
const METER_FLOOR_DB = -60;

export default {
  name: "AppRow",
  emits: ["change", "open-menu"],
  components: {RangeSelector, TextInput},

  props: {
    entry: {type: Object, required: true},
    rule: {type: Object, required: true},
    level: {type: Number, required: false, default: 0},
    // [{index, label}] of the playback routes that can be offered.
    routeOptions: {type: Array, required: true},
    ownOutputLabel: {type: String, required: true},
    menuButtonId: {type: String, required: true},
  },

  data() {
    return {
      rangeWidth: 150,

      // Range and TextInput only react to changes of their value props, so feed them from here (see Slider.vue).
      shownVolume: 0,

      dragging: false,
      localVolume: null,
      lastEmitted: null,
      throttleTimer: undefined,
    }
  },

  computed: {
    volume() {
      return this.localVolume ?? this.rule.volume;
    },

    // The rows keep their own draft while dragging, so no status patches need to be held back. This path is
    // never patched, it only keeps the Range component happy.
    storePath() {
      return "/config/macos_app_audio/drag";
    },

    meterWidth() {
      if (!(this.level > 0)) {
        return "0%";
      }
      let db = 20 * Math.log10(Math.min(this.level, 1));
      let position = (db - METER_FLOOR_DB) / -METER_FLOOR_DB;
      return Math.max(0, Math.min(1, position)) * 100 + "%";
    },
  },

  methods: {
    onRouteChange(e) {
      let value = e.target.value;
      this.$emit("change", this.entry.bundle_id, {route: value === "" ? null : parseInt(value)});
    },

    toggleMute() {
      this.$emit("change", this.entry.bundle_id, {muted: !this.rule.muted});
    },

    onRangeDown() {
      this.dragging = true;
    },

    onRangeInput(value) {
      this.sendVolume(parseInt(value), false);
    },

    onRangeUp() {
      this.dragging = false;
      this.sendVolume(this.volume, true);
    },

    onTextInput(value) {
      this.sendVolume(Math.max(0, Math.min(200, value)), false);
    },

    onWheel(e) {
      if (e.deltaY === 0) {
        return;
      }
      let step = e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP;
      this.sendVolume(Math.max(0, Math.min(200, this.volume + step)), false);
    },

    sendVolume(value, final) {
      this.localVolume = value;

      if (final) {
        clearTimeout(this.throttleTimer);
        this.throttleTimer = undefined;
        this.emitVolume(value);
        this.localVolume = null;
        return;
      }

      if (this.throttleTimer !== undefined) {
        // The trailing edge of the throttle will pick up the latest value.
        return;
      }

      this.emitVolume(value);
      this.throttleTimer = setTimeout(this.throttleElapsed, VOLUME_THROTTLE);
    },

    throttleElapsed() {
      this.throttleTimer = undefined;
      if (this.localVolume === null) {
        return;
      }

      if (this.localVolume !== this.lastEmitted) {
        this.emitVolume(this.localVolume);
        this.throttleTimer = setTimeout(this.throttleElapsed, VOLUME_THROTTLE);
        return;
      }

      // Nothing new came in, the parent's draft holds the value from here.
      if (!this.dragging) {
        this.localVolume = null;
      }
    },

    emitVolume(value) {
      this.lastEmitted = value;
      this.$emit("change", this.entry.bundle_id, {volume: value});
    },
  },

  mounted() {
    this.shownVolume = this.volume;
  },

  unmounted() {
    clearTimeout(this.throttleTimer);
  },

  watch: {
    volume(value) {
      this.shownVolume = value;
    },
  },
}
</script>

<style scoped>
.appRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 14px;
  row-gap: 6px;

  padding: 8px 12px;
  color: #ccc;
  list-style: none;
}

.appRow:focus-within {
  color: #fff;
}

.identity {
  display: flex;
  flex-direction: column;
  flex: 1 1 160px;
  min-width: 120px;
  overflow: hidden;
}

.identity .name {
  color: #fff;
  font-size: 1.1em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notRunning .identity .name {
  color: #ccc;
}

.identity .hint {
  color: #959796;
  font-size: 0.9em;
}

.meter {
  width: 80px;
  height: 6px;
  border-radius: 2px;
  overflow: hidden;
  /* Darker than both alternating row colours, so the empty part stays visible. */
  background-color: #151817;
}

.meterFill {
  height: 100%;
  background: linear-gradient(to right, #59b1b6 0, #59b1b6 70%, #d0c060 85%, #cc0000 100%);
  background-size: 80px 100%;
  transition: width 90ms linear;
}

/* A fixed output column keeps the meters and sliders lined up from row to row. */
.output {
  flex: 0 0 250px;
}

.output select {
  width: 100%;
  border: 0;
  background-color: transparent;
  font-family: LeagueMonoCondensed, sans-serif;
  font-size: 1em;
  color: #ccc;
}

.output select:hover {
  color: #fff;
  cursor: pointer;
}

.output select option {
  background-color: #2F2F2F;
}

.volume {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rangeBox {
  position: relative;
  padding: 6px 0 18px;
}

.unity {
  position: absolute;
  left: 50%;
  top: 15px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.unity .tick {
  width: 1px;
  height: 5px;
  background-color: #ccc;
}

.unity .tickLabel {
  color: #959796;
  font-size: 0.8em;
  line-height: 1;
}

.volumeInput {
  width: 64px;
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

.iconButton:hover:not(.active),
.iconButton:focus-visible:not(.active) {
  background-color: #49514e;
}

.iconButton.active {
  background-color: #59b1b6;
  color: #353937;
}

.iconButton.menu {
  width: 24px;
  background-color: transparent;
}
</style>
