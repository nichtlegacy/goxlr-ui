<template>
  <ul @keyup.stop.prevent="debugEvent" v-show="is_active" :aria-expanded="is_active" ref="menuList" role="menu"
      :id="menu_id"
 class="context-menu" v-click-outside="onClickOutside">
    <li role="presentation" v-for="(option, index) in options" :key="index" @click.stop="optionClicked(option)"
        class="item">
      <a role="menuitem">{{ option.name }}</a>
    </li>
  </ul>
</template>

<script>
export default {
  name: "DropMenu",
  emits: ['menu-closed', 'option-clicked'],

  props: {
    options: {
      type: Array,
      required: true,
    },
    // TODO: These should be required!
    menu_id: {type: String, required: false},
  },

  data() {
    return {
      return_id: null,
      identifier: null,
      is_active: false,

      focus_id: 0,
    };
  },

  methods: {
    showMenu(event, identifier, return_id, scrollTop) {
      if (scrollTop === undefined) {
        scrollTop = 0;
      }

      let positionElement = event.target;

      // If it's an SVG or Path, we need to locate the containing div..
      let found = false;
      while (!found) {
        if (positionElement.nodeName === "svg" || positionElement.nodeName === "path") {
          positionElement = positionElement.parentNode;
          continue;
        }
        found = true;
      }

      // We want to pop out from the right of whatever element was pressed, note that scrollTop has
      // to be considered, otherwise it'll pop low on scrollers.
      let left = positionElement.offsetLeft;
      let top = positionElement.offsetTop - scrollTop;

      // Now we need to position it to the bottom right of the element clicked..
      left += (positionElement.clientWidth);
      top += (positionElement.clientHeight / 2);


      this.identifier = identifier;
      this.return_id = return_id;
      const menu = this.$refs.menuList;

      let menuWidth = menu.offsetWidth;
      let menuHeight = menu.offsetHeight;

      let leftPosition = left + "px";
      let topPosition = top + "px";

      // Check if the Menu will break the window boundaries, and flip side if so.
      if (menuWidth + left >= window.innerWidth) {
        leftPosition = (left - menuWidth) + 'px';
      }

      let windowPosition = document.documentElement.scrollTop || document.body.scrollTop;
      if (menuHeight + top >= window.innerHeight + windowPosition) {
        topPosition = (top - menuHeight) + 'px';
      }

      // Set the Position..
      menu.style.left = leftPosition;
      menu.style.top = topPosition;

      // Activate the Menu, the option count may have changed since the last time it was open..
      this.is_active = true;
      this.focus_id = 0;

      // Wait for the menu to render
      let self = this;
      this.$nextTick(() => {
        self.setFocus(0);
      });
    },

    hideContextMenu() {
      // There are odd cases when this can trigger twice, don't do it if we're not here anymore.
      if (this.is_active) {
        let item = this.getItem(this.focus_id);
        if (item !== null) {
          item.tabIndex = -1;
        }
        this.focus_id = 0;
        this.is_active = false;

        // Return focus to the opening button...
        document.getElementById(this.return_id).focus();
        this.$emit('menu-closed');
      }
    },

    onClickOutside() {
      this.hideContextMenu();
    },

    optionClicked(option) {
      this.hideContextMenu();
      this.$emit('option-clicked', {
        item: this.identifier,
        option: option,
        return_id: this.return_id
      });
    },

    // The link inside an option, or null if that option doesn't exist (anymore).
    getItem(id) {
      return this.$refs.menuList?.children[id]?.firstElementChild ?? null;
    },

    setFocus(id) {
      // Remove the TabIndex from the Old item..
      let old = this.getItem(this.focus_id);
      if (old !== null) {
        old.tabIndex = -1;
      }

      // Set the focus on the new item and select..
      let item = this.getItem(id);
      if (item === null) {
        return;
      }
      item.tabIndex = 0;
      item.focus();
      this.focus_id = id;
    },

    debugEvent(e) {
      let children = this.$refs.menuList.childElementCount;

      // Ok, keydown, handle the key..
      switch (e.key) {
        case 'Esc':
        case 'Escape':
          this.hideContextMenu();
          break;

        case 'Up':
        case 'ArrowUp': {
          if (this.focus_id === 0 && children > 1) {
            this.setFocus(children - 1);
          } else if (children > 1) {
            this.setFocus(this.focus_id - 1);
          }
          break;
        }

        case 'Down':
        case 'ArrowDown': {
          if ((this.focus_id === children - 1) && children > 1) {
            this.setFocus(0);
          } else if (children > 1) {
            this.setFocus(this.focus_id + 1);
          }
          break;
        }

        case ' ':
        case 'Enter': {
          if (this.options[this.focus_id] !== undefined) {
            this.optionClicked(this.options[this.focus_id]);
          }
          break;
        }
      }
    }
  },
}
</script>

<style scoped>
.context-menu {
  background-color: #252927;
  color: #fff;
  border: 1px solid #6e7676;
  list-style: none;
  position: absolute;
  left: 0;
  margin: 0;
  padding: 0;
  top: 0;
  z-index: 1000000;
}

.context-menu .item {
  align-items: center;
  color: #fff;
  cursor: pointer;
  display: flex;
  padding: 5px 15px;
}

.context-menu .item:hover {
  background-color: #59b1b6 !important;
  color: white;
}

.context-menu .item:focus-within {
  background-color: #2d3230;
  color: white;
}

.context-menu .item a:focus {
  outline: none;
}

ul:first-child {
  margin-top: 4px;
}

ul:last-child {
  margin-bottom: 4px;
}
</style>
