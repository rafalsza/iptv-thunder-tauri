let preventClick = false;
let handled = false;
let resetTimeout: ReturnType<typeof setTimeout> | null = null;

export const tvLongPressState = {
  getPreventClick: () => preventClick,
  getHandled: () => handled,
  setHandled: (value: boolean) => { handled = value; },
  setPreventClick: (value: boolean) => { preventClick = value; },
  scheduleReset: (delay: number) => {
    if (resetTimeout) clearTimeout(resetTimeout);
    resetTimeout = setTimeout(() => {
      preventClick = false;
      handled = false;
      resetTimeout = null;
    }, delay);
  },
  reset: () => {
    preventClick = false;
    handled = false;
    if (resetTimeout) {
      clearTimeout(resetTimeout);
      resetTimeout = null;
    }
  },
};
