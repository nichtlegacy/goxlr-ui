<template>
  <div>
    <BigButton
        v-if="store.getConfig() !== undefined"
        id="settings_button"
        ref="button"
        :title="$t('message.system.settingsButton')"
        @button-clicked="$refs.modal.openModal(undefined, $refs.button)"
    >
      <font-awesome-icon icon="fa-solid fa-gear"/>
    </BigButton>
    <AccessibleModal
        width="630px"
        ref="modal"
        id="about_modal"
        :show_footer="false"
    >
      <template v-slot:title>{{ $t('message.system.settingsButton') }}</template>

      <div class="settingList" role="region" :aria-label="$t('message.system.settings.settingsRegionAccessibility')">
        <ListSetting :value="getCurrentLanguage()" :options="getLanguageKeys()"
                     :description="$t('message.system.settings.language')"
                     :label="$t('message.system.settings.language')" @change="setUILanguage"/>

        <ListSetting :value="getUIHandler()" :options="getUIHandlerKeys()"
                     :description="$t('message.system.settings.uiHandler')"
                     :label="$t('message.system.settings.uiHandler')" @change="setUIHandler"/>

        <ListSetting :value="getLogLevel()" :options="getLogKeys()" :description="$t('message.system.settings.logLevel')"
                     :label="$t('message.system.settings.logLevel')" @change="setLogLevel"/>

        <ListSetting :value="getFirmwareSource()" :options="getFirmwareSourceKeys()" :description="$t('message.system.settings.firmwareSource')"
                     :label="$t('message.system.settings.firmwareSource')" @change="setFirmwareSource"/>

        <BooleanSetting v-if="is_macos()" :label="$t('message.system.settings.macosAggregateManagement')" :enabled="get_macos_aggregate_management()"
                        @change="set_macos_aggregate_management"
                        :description="$t('message.system.settings.macosAggregateManagementAccessibility')"/>

        <section v-if="is_macos()" class="virtualAudioRoutes" :aria-label="$t('message.system.settings.virtualAudioRoutes')">
          <h3>{{ $t('message.system.settings.virtualAudioInputs') }}</h3>
          <BooleanSetting
              v-for="route in defaultVirtualAudioInputs"
              :key="route.bit"
              :label="$t(`message.system.settings.virtualAudioRouteNames.${route.key}`)"
              :enabled="isVirtualAudioRouteEnabled(route.bit)"
              :description="$t('message.system.settings.virtualAudioRouteAccessibility', { device: $t(`message.system.settings.virtualAudioRouteNames.${route.key}`) })"
              @change="setVirtualAudioRoute(route.bit, $event)"
          />

          <h3>{{ $t('message.system.settings.virtualAudioOutputs') }}</h3>
          <BooleanSetting
              v-for="route in defaultVirtualAudioOutputs"
              :key="route.bit"
              :label="$t(`message.system.settings.virtualAudioRouteNames.${route.key}`)"
              :enabled="isVirtualAudioRouteEnabled(route.bit)"
              :description="$t('message.system.settings.virtualAudioRouteAccessibility', { device: $t(`message.system.settings.virtualAudioRouteNames.${route.key}`) })"
              @change="setVirtualAudioRoute(route.bit, $event)"
          />

          <details class="optionalVirtualAudioRoutes">
            <summary>{{ $t('message.system.settings.optionalVirtualAudioRoutes') }}</summary>
            <h4>{{ $t('message.system.settings.virtualAudioInputs') }}</h4>
            <BooleanSetting
                v-for="route in optionalVirtualAudioInputs"
                :key="route.bit"
                :label="$t(`message.system.settings.virtualAudioRouteNames.${route.key}`)"
                :enabled="isVirtualAudioRouteEnabled(route.bit)"
                :description="$t('message.system.settings.virtualAudioRouteAccessibility', { device: $t(`message.system.settings.virtualAudioRouteNames.${route.key}`) })"
                @change="setVirtualAudioRoute(route.bit, $event)"
            />
            <h4>{{ $t('message.system.settings.virtualAudioOutputs') }}</h4>
            <BooleanSetting
                v-for="route in optionalVirtualAudioOutputs"
                :key="route.bit"
                :label="$t(`message.system.settings.virtualAudioRouteNames.${route.key}`)"
                :enabled="isVirtualAudioRouteEnabled(route.bit)"
                :description="$t('message.system.settings.virtualAudioRouteAccessibility', { device: $t(`message.system.settings.virtualAudioRouteNames.${route.key}`) })"
                @change="setVirtualAudioRoute(route.bit, $event)"
            />
          </details>
        </section>

        <BooleanSetting :label="$t('message.system.settings.allowNetworkAccess')" :enabled="get_allow_network_access()"
                        @change="set_allow_network_access"
                        :description="$t('message.system.settings.allowNetworkAccessAccessibility')"/>

        <BooleanSetting :label="$t('message.system.settings.autoStart')" :enabled="isAutostart()"
                        @change="setAutoStart" :description="$t('message.system.settings.autoStartAccessibility')"/>

        <BooleanSetting :label="$t('message.system.settings.showOnLaunch')" :enabled="isShowUi()"
                        @change="setShowUi" :description="$t('message.system.settings.showOnLaunchAccessibility')"/>

        <BooleanSetting :label="$t('message.system.settings.showTray')" :enabled="isShowIcon()"
                        @change="setShowIcon" :description="$t('message.system.settings.showTrayAccessibility')"/>

        <BooleanSetting v-if="isTTSAvailable()" :label="$t('message.system.settings.ttsOnButton')"
                        :enabled="isTTSEnabled()" @change="setTTSEnabled"
                        :description="$t('message.system.settings.ttsOnButtonAccessibility')"/>


        <div class="recoverDefaults" role="group" :aria-label="$t('message.system.settings.recoverDefaults')">
          <div class="label">{{ $t('message.system.settings.recoverDefaults') }}</div>
          <div class="buttons">
            <div>
              <button @click="recover_defaults('Profiles')">
                {{ $t('message.system.settings.recoverOptions.profiles') }}
              </button>
            </div>
            <div>
              <button @click="recover_defaults('MicProfiles')">
                {{ $t('message.system.settings.recoverOptions.micProfiles') }}
              </button>
            </div>
            <div>
              <button @click="recover_defaults('Icons')">
                {{ $t('message.system.settings.recoverOptions.icons') }}
              </button>
            </div>
            <div>
              <button @click="recover_defaults('Presets')">
                {{ $t('message.system.settings.recoverOptions.presets') }}
              </button>
            </div>
          </div>
        </div>

        <div class="shutdownButton">
          <div style="text-align: right">
            <button ref="shutdownButton" class="shutdown" @click="shutdown_util()">
              {{ $t('message.system.settings.shutdownUtility') }}
            </button>
          </div>
        </div>
      </div>
    </AccessibleModal>
    <AccessibleModal ref="shutdownConfirm" id="confirm_shutdown" @modal-close="closeConfirm">
      <template v-slot:title>{{ $t('message.system.settings.shutdownConfirmTitle') }}</template>
      <template v-slot:default>{{ $t('message.system.settings.shutdownConfirmMessage') }}</template>
      <template v-slot:footer>
        <ModalButton @click="isShutdown = true; $refs.shutdownConfirm.closeModal()">{{ $t('message.modalButtons.yes') }}</ModalButton>
        <ModalButton ref="focusNo" @click="$refs.shutdownConfirm.closeModal()">{{ $t('message.modalButtons.no') }}</ModalButton>
      </template>
    </AccessibleModal>
  </div>
</template>

<script>
import AccessibleModal from "@/components/design/modal/AccessibleModal.vue";
import BigButton from "@/components/buttons/BigButton.vue";
import {store} from "@/store";
import {websocket} from "@/util/sockets";
import {languages} from "@/lang/config";
import BooleanSetting from "@/components/sections/system/modals/settings/BooleanSetting.vue";
import ListSetting from "@/components/sections/system/modals/settings/ListSetting.vue";
import ModalButton from "@/components/design/modal/ModalButton.vue";

export default {
  name: "SettingsButton",
  computed: {
    defaultVirtualAudioInputs() {
      return [{bit: 1, key: "microphoneInput"}];
    },
    optionalVirtualAudioInputs() {
      return [
        {bit: 0, key: "broadcastMixInput"},
        {bit: 2, key: "samplerCaptureInput"},
        {bit: 3, key: "chatMicInput"},
        {bit: 4, key: "systemCaptureInput"},
        {bit: 5, key: "gameCaptureInput"},
        {bit: 6, key: "chatCaptureInput"},
        {bit: 7, key: "musicCaptureInput"},
        {bit: 8, key: "sampleCaptureInput"},
        {bit: 9, key: "lineInInput"},
        {bit: 10, key: "consoleInput"},
        {bit: 11, key: "dryMicInput"},
      ];
    },
    defaultVirtualAudioOutputs() {
      return [
        {bit: 12, key: "systemOutput"},
        {bit: 13, key: "gameOutput"},
        {bit: 14, key: "chatOutput"},
        {bit: 15, key: "musicOutput"},
      ];
    },
    optionalVirtualAudioOutputs() {
      return [
        {bit: 16, key: "sampleOutput"},
      ];
    },
    languages() {
      return languages
    },
    store() {
      return store
    }
  },
  components: {ModalButton, ListSetting, BooleanSetting, BigButton, AccessibleModal},

  data() {
    return {
      isShutdown: false,
    }
  },

  methods: {
    isLanguageSupported() {
      if (store.getConfig() === null) {
        return false;
      }
      return store.getConfig().hasOwnProperty("locale");
    },

    getLanguageKeys() {
      let options = [
        {
          key: "-1",
          value: this.$t('message.system.settings.useSystem')
        },
      ];

      for (let locale of Object.keys(languages)) {
        options.push({
          key: locale,
          value: languages[locale]
        })
      }
      return options;
    },

    getLogKeys() {
      return [
        {
          key: "Off",
          value: this.$t('message.system.settings.logLevels.off'),
        },
        {
          key: "Error",
          value: this.$t('message.system.settings.logLevels.error'),
        },
        {
          key: "Warn",
          value: this.$t('message.system.settings.logLevels.warn'),
        },
        {
          key: "Info",
          value: this.$t('message.system.settings.logLevels.info'),
        },
        {
          key: "Debug",
          value: this.$t('message.system.settings.logLevels.debug'),
        },
        {
          key: "Trace",
          value: this.$t('message.system.settings.logLevels.trace'),
        },
      ];
    },

    getFirmwareSourceKeys() {
      return [
        {
          key: "Live",
          value: this.$t('message.system.settings.firmwareSources.live'),
        },
        {
          key: "Beta",
          value: this.$t('message.system.settings.firmwareSources.beta'),
        }
      ]
    },

    getUIHandlerKeys() {
      let options = [];
      options.push({
        key: "browser",
        value: this.$t('message.system.settings.uiHandlers.browser')
      });
      if (this.getAppPath() !== null) {
        options.push({
          key: "app",
          value: this.$t('message.system.settings.uiHandlers.app')
        });
      }
      if (this.isCustomPath()) {
        options.push({
          key: "custom",
          value: this.$t('message.system.settings.uiHandlers.custom')
        });
      }

      return options;
    },

    getUIHandler() {
      if (this.getActivePath() === null) {
        return "browser";
      }
      if (this.isActivePath()) {
        return "app";
      }
      return "custom";
    },

    setUIHandler(value) {
      let newValue = null;
      if (value === "app") {
        newValue = this.getAppPath();
      }
      if (value === "custom") {
        // Do nothing here..
        return;
      }
      websocket.send_daemon_command({"SetActivatorPath": newValue})
    },

    setUILanguage(value) {
      let language = value;
      if (language === "-1") {
        language = null;
      }
      websocket.send_daemon_command({"SetLocale": language}).then(() => {
        if (language === null) {
          language = store.getConfig().locale.system_locale;
        }

        this.$i18n.locale = language;
      });
    },

    getUILanguageIsSystem() {
      if (store.getConfig() === null) {
        return true;
      }

      // If the User Locale is null, defer to the system locale..
      return store.getConfig().locale.user_locale === null;
    },

    getCurrentLanguage() {
      if (store.getConfig() === null) {
        return "-1";
      }

      if (store.getConfig().locale.user_locale === null) {
        return "-1";
      }
      return store.getConfig().locale.user_locale;
    },

    isCurrentLanguage(lang) {
      if (lang === "-1") {
        return this.getUILanguageIsSystem();
      }
      return lang === store.getConfig().locale.user_locale;
    },

    getActivePath() {
      if (store.getConfig() === undefined) {
        return null;
      }
      return store.getConfig().activation.active_path;
    },
    getAppPath() {
      if (store.getConfig() === undefined) {
        return "";
      }
      return store.getConfig().activation.app_path;
    },
    isCustomPath() {
      if (store.getConfig() === undefined) {
        return false;
      }
      let active_path = store.getConfig().activation.active_path;
      return (active_path !== null && !this.isActivePath());
    },
    isActivePath() {
      if (store.getConfig() === undefined || this.getActivePath() === null) {
        return false;
      }
      // Thanks to Windows Case-Insensitive paths :D
      return this.getActivePath().localeCompare(this.getAppPath(), undefined, {sensitivity: 'base'}) === 0;
    },

    getLogLevel() {
      if (store.getConfig() === undefined) {
        return "Debug";
      }
      return store.getConfig().log_level;
    },
    setLogLevel(value) {
      websocket.send_daemon_command({"SetLogLevel": value});
    },

    getFirmwareSource() {
      if (store.getConfig() === undefined) {
        return "Live";
      }
      return store.getConfig().firmware_source;
    },
    setFirmwareSource(value) {
      websocket.send_daemon_command({"SetFirmwareSource": value});
    },

    openLogs() {
      websocket.open_path("Logs");
    },

    get_allow_network_access() {
      if (store.getConfig() === undefined) {
        return false;
      }
      return store.getConfig().allow_network_access;
    },

    set_allow_network_access(value) {
      websocket.send_daemon_command({"SetAllowNetworkAccess": value});
    },

    get_macos_aggregate_management() {
      if (store.getConfig() === undefined) {
        return true;
      }
      return !store.getConfig().handle_macos_aggregates;
    },

    set_macos_aggregate_management(value) {
      websocket.send_daemon_command({"HandleMacOSAggregates": !value});
    },

    getVirtualAudioRoutes() {
      const mask = store.getConfig()?.macos_virtual_audio_routes;
      return Number.isInteger(mask) ? mask >>> 0 : 0xF002;
    },

    isVirtualAudioRouteEnabled(bit) {
      return (this.getVirtualAudioRoutes() & (1 << bit)) !== 0;
    },

    setVirtualAudioRoute(bit, enabled) {
      const bitMask = 1 << bit;
      const currentMask = this.getVirtualAudioRoutes();
      const newMask = enabled ? currentMask | bitMask : currentMask & ~bitMask;
      websocket.send_daemon_command({"SetMacOSVirtualAudioRoutes": newMask >>> 0});
    },

    isAutostart() {
      if (store.getConfig() === undefined) {
        return false;
      }

      return store.getConfig().autostart_enabled;
    },

    setAutoStart(value) {
      websocket.send_daemon_command({"SetAutoStartEnabled": value});
    },

    isShowUi() {
      if (store.getConfig() === undefined) {
        return false;
      }

      return store.getConfig().open_ui_on_launch;
    },

    setShowUi(value) {
      websocket.send_daemon_command({"SetUiLaunchOnLoad": value});
    },

    isShowIcon() {
      if (store.getConfig() === undefined) {
        return true;
      }

      return store.getConfig().show_tray_icon;
    },

    setShowIcon(value) {
      websocket.send_daemon_command({"SetShowTrayIcon": value});
    },

    isTTSAvailable() {
      if (store.getConfig() === undefined) {
        return false;
      }

      return store.getConfig().tts_enabled !== null;
    },

    isTTSEnabled() {
      return store.getConfig().tts_enabled;
    },

    setTTSEnabled(value) {
      websocket.send_daemon_command({"SetTTSEnabled": value});
    },

    recover_defaults(type) {
      websocket.send_daemon_command({"RecoverDefaults": type});
    },

    closeConfirm() {
      if (this.isShutdown) {
        this.isShutdown = false;
        websocket.send_daemon_command("StopDaemon");
      } else {
        this.$refs.modal.openModal(this.$refs.shutdownButton);
      }
    },

    shutdown_util() {
      this.$refs.modal.closeModal();
      this.$nextTick(() => {
        this.$refs.shutdownConfirm.openModal(this.$refs.focusNo);
      });
    },

    // It annoys me that this has to exist... but it is what it is :D
    is_macos() {
      if (store.getConfig() === undefined) {
        return true;
      }


      // Based on https://doc.rust-lang.org/std/env/consts/constant.OS.html - It's not my fault if it doesn't work!
      return store.getConfig().platform === "macos";
    }
  },
};
</script>

<style scoped>
.settingList {
  max-height: calc(100vh - 130px);
  overflow-y: auto;
}

.virtualAudioRoutes h3 {
  margin: 0;
  padding: 10px;
  color: #fff;
  font-size: 1rem;
}

.virtualAudioRoutes h4 {
  margin: 0;
  padding: 10px;
  color: #ddd;
  font-size: 0.95rem;
}

.optionalVirtualAudioRoutes > summary {
  padding: 10px;
  color: #ccc;
  cursor: pointer;
}

.optionalVirtualAudioRoutes > summary:hover {
  color: #fff;
}

.settingList > :nth-child(odd) {
  background-color: #353937;
}

.settingList > :nth-child(even) {
  background-color: #242826;
}

.recoverDefaults {
  display: flex;
  height: 20px;
  padding: 10px;
}

.recoverDefaults .label {
  margin: auto;
  width: 100%;
  color: #ccc;
}

.recoverDefaults .buttons {
  display: flex;
  gap: 10px;
}

.recoverDefaults .buttons div button {
  white-space: nowrap;
  border: 1px solid #CCCCCC;
  background-color: transparent;
  color: #ccc;
  padding: 3px 8px;
  cursor: pointer;
}

.recoverDefaults .buttons div button:hover {
  border: 1px solid #fff;
  color: #fff;
}

.shutdownButton {
  margin: auto;
  padding: 5px;
}

.shutdownButton .shutdown {
  color: #cccccc;
  border: 1px solid #cc0000;
  background-color: transparent;
  padding: 4px;
}

.shutdownButton .shutdown:hover {
  cursor: pointer;
  color: #ffffff;
  border: 1px solid #ff0000;
}


</style>
