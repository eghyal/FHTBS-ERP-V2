import { safeFetchJson, apiFetch } from "@/utils/api";
import React, { createContext, useContext, useState, ReactNode } from "react";
import {
  MessageSquare,
  Users,
  Globe,
  CheckCircle2,
  User,
} from "lucide-react";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { Modal } from "@/components/ui/Modal";

interface ShareData {
  type: "PROJECT" | "PR" | "PO";
  id: string;
  title: string;
  content: string;
}

interface ShareContextType {
  shareToForum: (
    type: "PROJECT" | "PR" | "PO",
    id: string,
    title: string,
    content: string,
  ) => void;
}

const ShareContext = createContext<ShareContextType | undefined>(undefined);

export function ShareProvider({ children }: { children: ReactNode }) {
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const { showToast } = useToast();

  const shareToForum = (
    type: "PROJECT" | "PR" | "PO",
    id: string,
    title: string,
    content: string,
  ) => {
    setShareData({ type, id, title, content });
    setMessage(content);
    setCategory("GENERAL");
  };

  const [threads, setThreads] = React.useState<any[]>([]);
  const [selectedThread, setSelectedThread] =
    React.useState<string>("THREAD-GENERAL");
  const [users, setUsers] = React.useState<any[]>([]);

  const getThreadTitle = (t: any) => {
    if (t.is_group) return t.name || "Group Chat";
    return (
      t.participants?.filter((p: string) => p !== user?.username).join(", ") ||
      "Direct Message"
    );
  };

  React.useEffect(() => {
    if (shareData) {
      if (user?.username) {
        apiFetch("/api/users/directory")
          .then((response) => {
            if (response.ok && Array.isArray(response.data)) {
              setUsers(
                response.data.filter((u: any) => u.username !== user?.username),
              );
            }
          })
          .catch(console.error);
        apiFetch("/api/chat/threads", {}, user.username)
          .then((response) => {
            if (response.ok && Array.isArray(response.data)) {
              setThreads(response.data);
            }
          })
          .catch(console.error);
      }
    }
  }, [shareData, user?.username]);

  const handleShare = async () => {
    if (!shareData) return;
    setIsSubmitting(true);
    try {
      const finalMsg = `${message}\n\n🔗 *Shared Resource: ${shareData.title}* (${shareData.type}) #${shareData.id}`;
      let targetThreadId =
        category === "GENERAL" ? "THREAD-GENERAL" : selectedThread;

      if (
        category === "GROUP" &&
        !targetThreadId.startsWith("THR-") &&
        !targetThreadId.startsWith("THREAD-") &&
        targetThreadId !== "THREAD-GENERAL"
      ) {
        // It's a username, create or get DM
        const dmResponse = await apiFetch(
          "/api/chat/threads",
          {
            method: "POST",
            body: JSON.stringify({
              name: "",
              is_group: false,
              participants: [targetThreadId, user?.username],
            }),
          },
          user?.username,
        );

        if (dmResponse.ok) {
          targetThreadId = dmResponse.data?.id;
        } else {
          throw new Error("Failed to create DM");
        }
      }

      const res = await apiFetch(
        `/api/chat/threads/${targetThreadId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: finalMsg,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("Shared via Message successfully!", "success");
        setShareData(null);
      } else {
        showToast(res.error || "Failed to share", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error sharing", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ShareContext.Provider value={{ shareToForum }}>
      {children}
      {shareData && (
        <Modal
          isOpen={!!shareData}
          onClose={() => setShareData(null)}
          maxWidth="md"
          title={
            <h3 className="text-lg font-medium text-stone-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-stone-900" /> Share to
              Forum
            </h3>
          }
          contentClassName="p-0 overflow-hidden"
        >
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                Shared Item
              </label>
              <div className="text-sm font-medium text-stone-900 bg-stone-50 p-3 rounded-lg border border-stone-100">
                {shareData.title}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                Destination Discussion
              </label>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  onClick={() => setCategory("GENERAL")}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${category === "GENERAL" ? "border-stone-900 bg-stone-100 text-stone-900" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"}`}
                >
                  <Globe className="w-5 h-5 mb-1" />
                  <span className="text-xs font-bold">General</span>
                </button>
                <button
                  onClick={() => setCategory("GROUP")}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${category === "GROUP" ? "border-stone-900 bg-stone-100 text-stone-900" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"}`}
                >
                  <Users className="w-5 h-5 mb-1" />
                  <span className="text-xs font-bold">Others</span>
                </button>
              </div>
              {category === "GROUP" && (
                <div className="w-full border border-stone-200 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto shadow-inner custom-scrollbar">
                  <button
                    type="button"
                    onClick={() => setSelectedThread("THREAD-GENERAL")}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-stone-50 transition-colors ${selectedThread === "THREAD-GENERAL" ? "bg-stone-50 text-stone-900" : ""}`}
                  >
                    <Globe
                      className={`w-4 h-4 ${selectedThread === "THREAD-GENERAL" ? "text-stone-900" : "text-stone-400"}`}
                    />
                    <span className="text-sm font-medium flex-1">Forum</span>
                    {selectedThread === "THREAD-GENERAL" && (
                      <CheckCircle2 className="w-4 h-4 text-stone-900 shrink-0" />
                    )}
                  </button>
                  {threads.filter((t) => t.id !== "THREAD-GENERAL").length >
                    0 && (
                    <div className="px-4 py-2 bg-stone-50 border-y border-stone-100 text-[10px] font-bold text-stone-400 uppercase tracking-widest sticky top-0 z-10 backdrop-blur-md bg-stone-50/90">
                      Your Conversations
                    </div>
                  )}
                  {threads
                    .filter((t) => t.id !== "THREAD-GENERAL")
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedThread(t.id)}
                        className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-stone-50 transition-colors ${selectedThread === t.id ? "bg-stone-50 text-stone-900" : ""}`}
                      >
                        {t.is_group ? (
                          <Users
                            className={`w-4 h-4 ${selectedThread === t.id ? "text-stone-900" : "text-stone-400"}`}
                          />
                        ) : (
                          <MessageSquare
                            className={`w-4 h-4 ${selectedThread === t.id ? "text-stone-900" : "text-stone-400"}`}
                          />
                        )}
                        <span className="text-sm font-medium flex-1">
                          {getThreadTitle(t)}
                        </span>
                        {selectedThread === t.id && (
                          <CheckCircle2 className="w-4 h-4 text-stone-900 shrink-0" />
                        )}
                      </button>
                    ))}
                  {users.length > 0 && (
                    <div className="px-4 py-2 bg-stone-50 border-y border-stone-100 text-[10px] font-bold text-stone-400 uppercase tracking-widest sticky top-0 z-10 backdrop-blur-md bg-stone-50/90">
                      Users (New Message)
                    </div>
                  )}
                  {users.map((u) => (
                    <button
                      key={u.username}
                      type="button"
                      onClick={() => setSelectedThread(u.username)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-stone-50 transition-colors ${selectedThread === u.username ? "bg-stone-50 text-stone-900" : "text-stone-700"}`}
                    >
                      <User
                        className={`w-4 h-4 shrink-0 mt-0.5 ${selectedThread === u.username ? "text-stone-900" : "text-stone-400"}`}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{u.name}</div>
                        <div
                          className={`text-xs ${selectedThread === u.username ? "text-stone-600" : "text-stone-400"}`}
                        >
                          @{u.username}
                        </div>
                      </div>
                      {selectedThread === u.username && (
                        <CheckCircle2 className="w-4 h-4 text-stone-900 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                Accompanying Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full border border-stone-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-stone-400 h-24 resize-none"
                placeholder="Add a message to your shared item..."
              />
            </div>
          </div>
          <div className="p-6 border-t border-stone-100 flex justify-end gap-3 bg-stone-50/50">
            <button
              onClick={() => setShareData(null)}
              className="px-6 py-2 bg-white border border-stone-200 text-stone-600 rounded-lg font-medium text-sm hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={isSubmitting || !message.trim()}
              className="px-6 py-2 bg-stone-900 text-white rounded-lg font-medium text-sm hover:bg-stone-800 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Sharing..." : "Share Now"}
            </button>
          </div>
        </Modal>
      )}
    </ShareContext.Provider>
  );
}

export function useShare() {
  const context = useContext(ShareContext);
  if (context === undefined) {
    throw new Error("useShare must be used within a ShareProvider");
  }
  return context;
}
