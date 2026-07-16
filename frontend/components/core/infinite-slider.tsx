"use client";

import { useState } from "react";
import { motion, useAnimationFrame, useMotionValue } from "framer-motion";

interface InfiniteSliderProps {
  children: React.ReactNode;
  /** Horizontal gap between items, in pixels. */
  gap?: number;
  /** Pixels traversed per second. */
  speed?: number;
  /** Scroll right-to-left instead of left-to-right. */
  reverse?: boolean;
}

/**
 * A continuously scrolling marquee. The children are rendered twice back to
 * back; the track is translated by up to one copy's width and wraps, so the
 * loop is seamless regardless of how many items are passed in. Motion pauses
 * on hover so users can read a given item.
 */
export default function InfiniteSlider({
  children,
  gap = 24,
  speed = 40,
  reverse = false,
}: InfiniteSliderProps) {
  const translation = useMotionValue(0);
  const [wrapWidth, setWrapWidth] = useState(0);
  const [paused, setPaused] = useState(false);

  useAnimationFrame((_, delta) => {
    if (paused || wrapWidth === 0) return;
    const move = (speed * delta) / 1000;
    let next = translation.get() + (reverse ? move : -move);
    // Wrap within [-wrapWidth, 0] so the second copy seamlessly replaces the first.
    if (next <= -wrapWidth) next += wrapWidth;
    if (next >= 0) next -= wrapWidth;
    translation.set(next);
  });

  return (
    <div className="overflow-hidden">
      <motion.div
        className="flex w-max flex-nowrap"
        style={{ x: translation, gap }}
        onHoverStart={() => setPaused(true)}
        onHoverEnd={() => setPaused(false)}
      >
        <div
          className="flex flex-none items-center"
          style={{ gap }}
          ref={(node) => {
            // One copy's width plus the parent gap to the next copy: translating
            // by exactly this lands copy 2's first item where copy 1's began, so
            // the loop has no visible seam.
            if (node) setWrapWidth(node.offsetWidth + gap);
          }}
        >
          {children}
        </div>
        <div className="flex flex-none items-center" style={{ gap }} aria-hidden>
          {children}
        </div>
      </motion.div>
    </div>
  );
}
