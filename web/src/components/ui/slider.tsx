import { Slider as SliderPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        'relative flex w-full touch-none select-none items-center',
        'data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-zinc-800"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-brand"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="block size-3 rounded-full border border-brand bg-brand ring-offset-surface-app transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
