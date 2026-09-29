<template>
  <div v-if='isActive'>
    <slot></slot>
  </div>
</template>

<script>
export default {
  name: "TabButton",
  props: {
    id: {type: String, required: true},
    name: {type: String, required: true},
    selected: {type: Boolean, default: false},
  },
  data() {
    return {
      // Start from the selected prop, so unselected tabs don't mount their content once at startup.
      isActive: this.selected
    }
  },

  computed: {
    href() {
      return '#' + this.name.toLowerCase().replace(/ /g, '-');
    }
  },

  created() {
    this.$parent.tabs.push(this);
  },

  unmounted() {
    let index = this.$parent.tabs.indexOf(this);
    if (index !== -1) {
      this.$parent.tabs.splice(index, 1);
    }
  }
}
</script>

<style scoped>
</style>
