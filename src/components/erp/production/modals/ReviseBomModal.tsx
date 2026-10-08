import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface ReviseBomModalProps {
  isOpen: boolean;
  onClose: () => void;
  handleReviseBom: (e: React.FormEvent) => void;
  reviseNote: string;
  setReviseNote: (note: string) => void;
  isSubmitting: boolean;
}

export const ReviseBomModal: React.FC<ReviseBomModalProps> = ({
  isOpen,
  onClose,
  handleReviseBom,
  reviseNote,
  setReviseNote,
  isSubmitting,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mark BOM for Revision"
      maxWidth="md"
    >
      <form onSubmit={handleReviseBom} className="space-y-4">
        <p className="text-xs text-stone-600">
          Please provide a reason for the revision. This will be visible to the engineering team.
        </p>
        <textarea
          value={reviseNote}
          onChange={(e) => setReviseNote(e.target.value)}
          className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
          rows={4}
          placeholder="What needs to be changed?"
          required
        />
        <div className="pt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="bg-rose-600 text-white hover:bg-rose-700">
            {isSubmitting ? "Saving..." : "Mark for Revision"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
