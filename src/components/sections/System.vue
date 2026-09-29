<template>
  <CenteredContainer>
    <div class="systemColumn">
      <GroupContainer :title="$t('message.system.title')">
        <div class="buttons">
          <MicSetupButton />
          <SwitchDeviceButton v-if="store.getDeviceCount() > 1" />
          <FirmwareUpdateButton />
          <ShutdownButton />
          <DeviceSettingsButton />
          <SettingsButton />
          <AboutButton />
          <LicenseButton />
          <HelpButton />
        </div>
      </GroupContainer>

      <KeyboardShortcuts v-if="hasHotkeys"/>
    </div>
  </CenteredContainer>
</template>

<script>
import MicSetupButton from "@/components/sections/system/modals/MicSetupButton.vue";
import CenteredContainer from "@/components/containers/CenteredContainer.vue";
import GroupContainer from "@/components/containers/GroupContainer.vue";
import LicenseButton from "@/components/sections/system/modals/LicenseButton.vue";
import AboutButton from "@/components/sections/system/modals/AboutButton.vue";
import SettingsButton from "@/components/sections/system/modals/SettingsButton.vue";
import HelpButton from "@/components/sections/system/HelpButton.vue";
import ShutdownButton from "@/components/sections/system/modals/PowerButton.vue";
import DeviceSettingsButton from "@/components/sections/system/modals/DeviceSettingsButton.vue";
import SwitchDeviceButton from "@/components/sections/system/modals/SwitchDeviceButton.vue";
import {store} from "@/store";
import FirmwareUpdateButton from "@/components/sections/system/modals/FirmwareUpdateButton.vue";
import KeyboardShortcuts from "@/components/sections/system/KeyboardShortcuts.vue";

export default {
  name: "SystemComponent",
  computed: {
    store() {
      return store
    },

    // Only macOS daemons report the hotkey list.
    hasHotkeys() {
      return Array.isArray(store.getConfig()?.macos_hotkeys);
    }
  },
  components: {
    KeyboardShortcuts,
    FirmwareUpdateButton,
    SwitchDeviceButton,
    DeviceSettingsButton,
    ShutdownButton,
    HelpButton,
    SettingsButton,
    AboutButton,
    LicenseButton,
    GroupContainer,
    CenteredContainer,
    MicSetupButton
  },
}
</script>

<style scoped>
.systemColumn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.buttons {
  display: flex;
  flex-direction: row;
  gap: 15px;
}
</style>
