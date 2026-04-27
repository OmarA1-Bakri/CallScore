"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import clsx from "clsx";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";

const Root = RadixDialog.Root;
const Trigger = RadixDialog.Trigger;
const Close = RadixDialog.Close;
const Portal = RadixDialog.Portal;
const Title = RadixDialog.Title;
const Description = RadixDialog.Description;

const Overlay = forwardRef<
  ElementRef<typeof RadixDialog.Overlay>,
  ComponentPropsWithoutRef<typeof RadixDialog.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return <RadixDialog.Overlay ref={ref} className={clsx("dialog-overlay", className)} {...props} />;
});

interface DialogContentProps extends ComponentPropsWithoutRef<typeof RadixDialog.Content> {
  readonly surface?: "modal" | "drawer" | "sheet";
  readonly showClose?: boolean;
}

const Content = forwardRef<ElementRef<typeof RadixDialog.Content>, DialogContentProps>(
  function DialogContent({ className, children, surface = "modal", showClose = true, ...props }, ref) {
    return (
      <Portal>
        <Overlay data-surface={surface} />
        <RadixDialog.Content
          ref={ref}
          className={clsx("dialog-content", `dialog-${surface}`, className)}
          {...props}
        >
          {children}
          {showClose ? (
            <Close className="dialog-close" aria-label="Close dialog">
              <X aria-hidden="true" size={16} strokeWidth={1.4} />
            </Close>
          ) : null}
        </RadixDialog.Content>
      </Portal>
    );
  },
);

export {
  Root,
  Trigger,
  Close,
  Portal,
  Overlay,
  Content,
  Title,
  Description,
};
