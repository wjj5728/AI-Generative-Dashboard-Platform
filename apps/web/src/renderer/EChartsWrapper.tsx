import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface EChartsWrapperProps {
  option: EChartsOption;
  height?: number;
}

export const EChartsWrapper: React.FC<EChartsWrapperProps> = ({
  option,
  height = 260,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const hasRenderedOnceRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const instance = echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = instance;

    const observer = new ResizeObserver(() => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (chartRef.current && !chartRef.current.isDisposed()) {
          chartRef.current.resize({
            animation: { duration: 180, easing: 'cubicOut' },
          });
        }
      });
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      instance.dispose();
      chartRef.current = null;
      hasRenderedOnceRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && !chartRef.current.isDisposed()) {
      const smoothOption: EChartsOption = {
        animation: true,
        animationDuration: 420,
        animationEasing: 'cubicOut',
        animationDurationUpdate: 240,
        animationEasingUpdate: 'cubicOut',
        ...option,
      };
      chartRef.current.setOption(smoothOption, {
        notMerge: !hasRenderedOnceRef.current,
        replaceMerge: hasRenderedOnceRef.current ? ['series'] : undefined,
        lazyUpdate: true,
      });
      hasRenderedOnceRef.current = true;
    }
  }, [option]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: `${height}px`, minHeight: `${height}px` }}
    />
  );
};
