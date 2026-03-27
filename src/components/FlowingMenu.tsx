import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface MenuItem {
  text: string;
  onClick: () => void;
  active?: boolean;
}

interface FlowingMenuProps {
  items: MenuItem[];
  speed?: number;
  textColor?: string;
  bgColor?: string;
  marqueeBgColor?: string;
  marqueeTextColor?: string;
  borderColor?: string;
  onClose?: () => void;
}

const FlowingMenu: React.FC<FlowingMenuProps> = ({
  items,
  speed = 10,
  textColor = "#ffffff",
  bgColor = "#0f172a",
  marqueeBgColor = "#ffffff",
  marqueeTextColor = "#0f172a",
  borderColor = "#ffffff",
  onClose
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="absolute right-0 mt-2 w-56 glass rounded-2xl shadow-2xl overflow-hidden z-50 border border-white/10 p-1"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      <div className="flex flex-col">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-3 py-2">Delivery Method</p>
        {items.map((item, index) => (
          <div 
            key={index}
            className="group relative rounded-xl h-10 cursor-pointer overflow-hidden transition-all duration-300 mb-1 last:mb-0"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={() => {
              item.onClick();
              if (onClose) onClose();
            }}
          >
            {/* Marquee Background on Hover */}
            <motion.div 
              className="absolute inset-0 z-0 flex items-center overflow-hidden"
              initial={{ x: '100%' }}
              animate={{ x: hoveredIndex === index ? '0%' : '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: "easeInOut" }}
              style={{ backgroundColor: marqueeBgColor }}
            >
              <div className="flex whitespace-nowrap animate-marquee" style={{ animationDuration: `${speed}s` }}>
                {[...Array(10)].map((_, i) => (
                  <span 
                    key={i} 
                    className="text-sm font-black uppercase px-4"
                    style={{ color: marqueeTextColor }}
                  >
                    {item.text}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* Static Text */}
            <div className="relative z-10 h-full flex items-center justify-between px-3 pointer-events-none">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold transition-all duration-300 ${hoveredIndex === index ? 'opacity-0' : 'opacity-100'}`}>
                  {item.text}
                </span>
                {item.active && hoveredIndex !== index && (
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </div>
              {item.active && hoveredIndex !== index && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-accent">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee linear infinite;
        }
      `}} />
    </motion.div>
  );
};

export default FlowingMenu;
