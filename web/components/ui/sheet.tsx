"use client";

import * as React from "react";
import { Drawer as VaulDrawer } from "vaul";
import { cn } from "@/lib/utils";

/**
 * Mobile-first bottom sheet (Vaul). All overlays in the app go through this —
 * dialogs feel desktop-y and waste vertical space (see CLAUDE.md). Sheets
 * support snap points, drag-to-dismiss, and swipe physics natively.
 */
export const Sheet = VaulDrawer.Root;
export const SheetTrigger = VaulDrawer.Trigger;
export const SheetClose = VaulDrawer.Close;
export const SheetPortal = VaulDrawer.Portal;

function useKeyboardSafeSheetVars() {
  React.useEffect(() => {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewportHeight = visualViewport?.height ?? window.innerHeight;
        const rawBottomInset = visualViewport
          ? window.innerHeight - visualViewport.height - visualViewport.offsetTop
          : 0;
        const keyboardInset = rawBottomInset > 120 ? rawBottomInset : 0;

        root.style.setProperty(
          "--sheet-visual-viewport-height",
          `${Math.round(viewportHeight)}px`,
        );
        root.style.setProperty(
          "--sheet-keyboard-inset",
          `${Math.round(Math.max(0, keyboardInset))}px`,
        );
      });
    };

    update();
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      cancelAnimationFrame(frame);
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--sheet-visual-viewport-height");
      root.style.removeProperty("--sheet-keyboard-inset");
    };
  }, []);
}

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-40 bg-black/60 backdrop-blur-sm", className)}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Content>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Content>
>(({ className, children, ...props }, ref) => {
  useKeyboardSafeSheetVars();

  return (
    <SheetPortal>
      <SheetOverlay />
      <VaulDrawer.Content
        ref={ref}
        className={cn(
          "keyboard-safe-sheet fixed left-0 right-0 z-50 flex flex-col bg-surface-elevated",
          "border-t border-border rounded-t-[12px]",
          "pb-[env(safe-area-inset-bottom)]",
          "outline-none",
          className,
        )}
        {...props}
      >
        <div
          aria-hidden
          className="mx-auto mt-2 h-1 w-10 rounded-full bg-border"
        />
        {children}
      </VaulDrawer.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-5 pt-4 pb-2", className)} {...props} />
);

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Title>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Title>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Title
    ref={ref}
    className={cn("text-[18px] leading-6 font-normal", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Description>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Description>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Description
    ref={ref}
    className={cn("text-[14px] leading-5 text-text-secondary", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";
