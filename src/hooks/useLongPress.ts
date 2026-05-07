import React, { useRef, useCallback, useState } from 'react';

type LongPressCallback = (e: React.TouchEvent | React.MouseEvent | React.KeyboardEvent) => void;

interface UseLongPressOptions {
  onLongPress: LongPressCallback;
  delay?: number;
  shouldPreventDefault?: boolean;
}

export const useLongPress = ({
  onLongPress,
  delay = 500,
  shouldPreventDefault = true,
}: UseLongPressOptions) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef<EventTarget | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      // Only prevent default on touch events to avoid interfering with mouse clicks
      if (shouldPreventDefault && e instanceof TouchEvent) {
        e.preventDefault();
      }
      
      setIsLongPress(false);
      targetRef.current = e.target;
      
      timeoutRef.current = setTimeout(() => {
        setIsLongPress(true);
        onLongPress(e);
      }, delay);
    },
    [onLongPress, delay, shouldPreventDefault]
  );

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    targetRef.current = null;
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      start(e);
    },
    [start]
  );

  const onMouseUp = useCallback(
    (_e: React.MouseEvent) => {
      clear();
      // Reset long press state after a short delay
      setTimeout(() => setIsLongPress(false), 100);
    },
    [clear]
  );

  const onMouseLeave = useCallback(
    (_e: React.MouseEvent) => {
      clear();
      setIsLongPress(false);
    },
    [clear]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (shouldPreventDefault) {
        e.preventDefault();
      }
      start(e);
    },
    [start, shouldPreventDefault]
  );

  const onTouchEnd = useCallback(
    (_e: React.TouchEvent) => {
      clear();
      setTimeout(() => setIsLongPress(false), 100);
    },
    [clear]
  );

  const onTouchMove = useCallback(
    (_e: React.TouchEvent) => {
      clear();
      setIsLongPress(false);
    },
    [clear]
  );

  // Note: onKeyDown and onKeyUp are intentionally not included in the return
  // to avoid blocking TV remote key events. Long press on TV should be triggered
  // by holding the button, not by the key handlers which can interfere with navigation.

  return {
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    isLongPress,
  };
};
