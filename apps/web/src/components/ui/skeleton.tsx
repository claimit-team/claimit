import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-md bg-neutral-100 bg-[length:200%_100%] bg-gradient-to-r from-neutral-100 via-neutral-50 to-neutral-100 dark:from-neutral-100 dark:via-neutral-200 dark:to-neutral-100",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
