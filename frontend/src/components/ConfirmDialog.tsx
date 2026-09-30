import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ConfirmDialog({
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "sm",
  title,
  description,
  confirmLabel = "Confirm",
  destructive = true,
  onConfirm,
  testid,
  disabled,
}: {
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  triggerSize?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
  testid: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={triggerVariant}
            size={triggerSize}
            disabled={disabled}
            data-testid={`${testid}-trigger`}
          />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent data-testid={`${testid}-dialog`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-lg font-bold">
            {destructive && <TriangleAlert className="h-5 w-5 text-destructive" aria-hidden="true" />}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            data-testid={`${testid}-cancel`}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            data-testid={`${testid}-confirm`}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
