// =========================
// 🎠 HORIZONTAL CAROUSEL COMPONENT
// =========================
import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalCarouselProps {
  title: string;
  children: React.ReactNode;
  showArrows?: boolean;
}

export const HorizontalCarousel: React.FC<HorizontalCarouselProps> = ({
  title,
  children,
  showArrows = true,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      setCanScrollLeft(scrollRef.current.scrollLeft > 0);
      setCanScrollRight(
        scrollRef.current.scrollLeft <
          scrollRef.current.scrollWidth - scrollRef.current.clientWidth
      );
    }
  };

  useEffect(() => {
    checkScroll();
    const ref = scrollRef.current;
    if (ref) {
      ref.addEventListener('scroll', checkScroll);
      return () => ref.removeEventListener('scroll', checkScroll);
    }
  }, [children]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="mb-12">
      {/* Title */}
      <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 px-4 md:px-16 hover:text-[#E50914] transition-colors cursor-pointer">
        {title}
      </h2>

      {/* Carousel Container */}
      <div className="relative group">
        {/* Left Arrow */}
        {showArrows && canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-10 w-16 bg-gradient-to-r from-black/80 to-transparent hover:from-black/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-10 h-10 text-white drop-shadow-lg" />
          </button>
        )}

        {/* Scrollable Content */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto px-4 md:px-16 pb-4 scroll-smooth scrollbar-hide"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {children}
        </div>

        {/* Right Arrow */}
        {showArrows && canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-10 w-16 bg-gradient-to-l from-black/80 to-transparent hover:from-black/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-10 h-10 text-white drop-shadow-lg" />
          </button>
        )}
      </div>
    </div>
  );
};
