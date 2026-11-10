// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Dialogs used by supplier creation, updates, deactivation and activation.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SupplierModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

const SupplierModal = ({
  open, onClose, title, children, icon
}: SupplierModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="indigo"
            className="flex items-center gap-2"
          >
            {icon}
            {title}
          </Button>
        }
      />

      <DialogContent className="w-full md:max-w-2xl! max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
};

export default SupplierModal;
