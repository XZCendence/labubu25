import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: `transition-all duration-100
          outline-black/40 outline-1 outline-offset-0 border-none
          bg-gradient-to-b from-lime-600 to-lime-500
          !text-white [text-shadow:0_1px_rgba(0,0,0,0.2)]
          shadow-[inset_0_1px_0px_rgba(255,255,255,0.3),inset_0_-1px_0px_rgba(0,0,0,0.4),0_1px_2px_rgba(0,0,0,0.4),0_0_0_1px_black]
          hover:bg-gradient-to-b hover:from-lime-500 hover:to-lime-400
          hover:shadow-[inset_0_1px_0px_rgba(255,255,255,0.3),inset_0_-1px_0px_rgba(0,0,0,0.4),0_2px_4px_rgba(0,0,0,0.4),0_0_0_1px_rgb(37,99,235)]
          active:opacity-75
          active:shadow-[inset_0_1px_2px_rgb(30,64,175),0_0_0_1px_black]`,
        destructive: `transition-all duration-100
          outline-black/40 outline-1 outline-offset-0 border-none
          bg-gradient-to-b from-red-600 to-red-500
          !text-white [text-shadow:0_1px_rgba(0,0,0,0.2)]
          shadow-[inset_0_1px_0px_rgba(255,255,255,0.3),inset_0_-1px_0px_rgba(0,0,0,0.4),0_1px_2px_rgba(0,0,0,0.4),0_0_0_1px_black]
          hover:bg-gradient-to-b hover:from-red-500 hover:to-red-400
          hover:shadow-[inset_0_1px_0px_rgba(255,255,255,0.3),inset_0_-1px_0px_rgba(0,0,0,0.4),0_2px_4px_rgba(0,0,0,0.4),0_0_0_1px_rgb(220,38,38)]
          active:opacity-75
          active:shadow-[inset_0_1px_2px_rgb(153,27,27),0_0_0_1px_black]`,
        outline: `border-0 rounded-md transition-all duration-100
          outline-black/40 outline-1 outline-offset-0
          bg-gradient-to-b from-gray-800 to-gray-900 text-gray-200
          shadow-[inset_0_1px_0px_rgba(255,255,255,0.01),inset_0_-1px_0px_rgba(0,0,0,0.2),0_1px_2px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.2)]
          hover:bg-gradient-to-b hover:from-gray-700 hover:to-gray-800
          hover:shadow-[inset_0_1px_0px_rgba(255,255,255,0.03),inset_0_-1px_0px_rgba(0,0,0,0.2),0_2px_4px_rgba(0,0,0,0.2),0_0_0_1px_rgba(70,70,70,0),inset_0_0_0_1px_rgba(100,100,100,0.4)]
          active:bg-gradient-to-b active:from-gray-700 active:to-gray-750
          active:shadow-[inset_0_1px_1px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.2)]
          active:text-gray-300`,
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "bg-transparent hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-0.5 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 py-0.5 has-[>svg]:px-2.5",
        xs: "h-7 px-2 py-0.5 text-sm rounded-sm",
        lg: "h-10 rounded-md px-6 py-0.5 has-[>svg]:px-4",
        icon: "size-9",
        minimal: "h-7 px-2 py-0.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
