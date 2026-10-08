/**
 * Forum/Chat System
 */
import { safeFetchJson, apiFetch } from "@/utils/api";
import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useInterval } from "@/hooks/useInterval";
import {
  MessageSquare,
  Plus,
  Send,
  User,
  Search,
  Paperclip,
  MoreVertical,
  X,
  Trash2,
  File,
  Check,
  Users,
  Briefcase,
  ShoppingCart,
  ExternalLink,
  ClipboardList,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

interface Thread {
  id: string;
  name: string | null;
  is_group: number;
  created_at: string;
  created_by: string;
  last_message: string | null;
  last_message_time: string | null;
  participants: string[];
}

interface Message {
  id: string;
  thread_id: string;
  sender_username: string;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  is_deleted: number;
  created_at: string;
  read_by?: string;
}

interface UserDirectory {
  username: string;
  name: string;
  role: string;
}

const getColorHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "bg-emerald-50 text-emerald-700 border-emerald-100",
    "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400",
    "bg-amber-50 text-amber-700 border-amber-100",
    "bg-stone-100 text-stone-900 border-stone-200",
    "bg-rose-50 text-rose-700 border-rose-100",
    "bg-purple-50 text-purple-700 border-purple-100",
    "bg-teal-50 text-teal-700 border-teal-100",
  ];
  return colors[Math.abs(hash) % colors.length];
};

export default function Forum() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [directory, setDirectory] = useState<UserDirectory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [showNewChat, setShowNewChat] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");

  const [newMessage, setNewMessage] = useState("");
  const [attachingFile, setAttachingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchDirectory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/users/directory", {}, user?.username);
      if (res.ok) {
        setDirectory(Array.isArray(res.data) ? res.data : []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [user?.username, showToast]);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await apiFetch("/api/chat/threads", {}, user?.username);
      if (res.ok) {
        const data = res.data;
        setThreads((prev) => {
          if (prev.length > 0) {
            data.forEach((newThread: any) => {
              const oldThread = prev.find((t) => t.id === newThread.id);
              if (oldThread && newThread.last_message_time && oldThread.last_message_time !== newThread.last_message_time) {
                // If the last message sender is NOT the current user
                if (newThread.last_message_sender && newThread.last_message_sender !== user?.username) {
                  showToast(`New message in ${newThread.is_group ? newThread.name || 'Group' : (newThread.name || 'Chat')}`, 'info');
                }
              }
            });
          }
          return data;
        });
        setSelectedThread((prev) => {
          if (!prev) return prev;
          const updated = data.find((t: Thread) => t.id === prev.id);
          return updated || prev;
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, [user?.username, showToast]);

  const fetchMessages = useCallback(
    async (threadId: string, shouldScroll = false) => {
      try {
        const res = await apiFetch(
          `/api/chat/threads/${threadId}/messages`,
          {},
          user?.username,
        );
        if (res.ok) {
          // Prevent race condition where old background fetch completes after switching conversations
          if (threadId === selectedThread?.id) {
            setMessages((prev) => {
              // Functional updater to deeply check if list has actual differences.
              // If contents are identical, return the previous state reference to completely bypass unneeded React renders.
              if (
                prev.length === res.data.length &&
                prev.every(
                  (m, idx) =>
                    m.id === res.data[idx].id &&
                    m.content === res.data[idx].content &&
                    m.is_deleted === res.data[idx].is_deleted &&
                    m.file_url === res.data[idx].file_url,
                )
              ) {
                return prev;
              }
              return res.data;
            });
          }

          // Mark as read only on explicit thread view (not on every background poll tick)
          if (user?.username && shouldScroll) {
            apiFetch(
              `/api/chat/threads/${threadId}/read`,
              {
                method: "POST",
              },
              user.username,
            )
              .then(() => {
                window.dispatchEvent(new CustomEvent("chat:unread_update"));
              })
              .catch(console.error);
          }
        }
      } catch (e) {
        console.error(e);
      }
    },
    [user?.username, selectedThread?.id],
  );

  useEffect(() => {
    fetchDirectory();
    fetchThreads();
  }, [user, fetchDirectory, fetchThreads]);

  useInterval(fetchThreads, 5000);

  const fetchMessagesPolling = useCallback(() => {
    if (selectedThread?.id) {
      fetchMessages(selectedThread.id, false);
    }
  }, [selectedThread?.id, fetchMessages]);

  useInterval(fetchMessagesPolling, selectedThread ? 3000 : null);

  useEffect(() => {
    setMessages([]); // Purge old thread's messages to prevent visual glitch
    setNewMessage(""); // Reset unsent draft text
    setAttachingFile(null); // Reset layout attachment state
    if (selectedThread?.id) {
      fetchMessages(selectedThread.id, true);
    }
  }, [selectedThread?.id, fetchMessages]);

  const [showAddMember, setShowAddMember] = useState(false);
  const [showMembersList, setShowMembersList] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, message: "", onConfirm: () => {} });

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) return;
    const isGroup = selectedUsers.length > 1;
    if (isGroup && !groupName) {
      showToast("Please enter a group name", "error");
      return;
    }

    try {
      const res = await apiFetch(
        "/api/chat/threads",
        {
          method: "POST",
          body: JSON.stringify({
            name: isGroup ? groupName : null,
            is_group: isGroup,
            participants: selectedUsers,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        const { id } = res.data;
        await fetchThreads();
        // The threads list should now have the new thread
        setThreads((prev) => {
          const newThread = prev.find((t) => t.id === id);
          if (newThread) setSelectedThread(newThread);
          return prev;
        });
        setShowNewChat(false);
        setSelectedUsers([]);
        setGroupName("");
      } else {
        const r = res.data;
        if (r && r.id) {
          await fetchThreads();
          setThreads((prev) => {
            const newThread = prev.find((t) => t.id === r.id);
            if (newThread) setSelectedThread(newThread);
            return prev;
          });
          setShowNewChat(false);
          setSelectedUsers([]);
          setGroupName("");
        } else {
          showToast(res.error || "Failed to create chat", "error");
        }
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to create chat", "error");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || (!newMessage.trim() && !attachingFile)) return;

    let fileData = null;
    if (attachingFile) {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", attachingFile);
      try {
        const uploadRes = await apiFetch(
          "/api/upload",
          {
            method: "POST",
            body: formData,
          },
          user?.username,
        );
        if (uploadRes.ok) {
          const { url } = uploadRes.data;
          fileData = {
            file_url: url,
            file_name: attachingFile.name,
            file_size: attachingFile.size,
            file_type: attachingFile.type,
          };
        } else {
          showToast(uploadRes.error || "File upload failed", "error");
          setUploading(false);
          return;
        }
      } catch (e) {
        showToast("File upload failed", "error");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    try {
      const res = await apiFetch(
        `/api/chat/threads/${selectedThread.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: newMessage.trim(),
            ...fileData,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        setNewMessage("");
        setAttachingFile(null);
        fetchMessages(selectedThread.id, true);
        fetchThreads();
        window.dispatchEvent(new CustomEvent("chat:unread_update"));
      } else {
        showToast(res.error || "Failed to send message", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to send message", "error");
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    setConfirmModal({
      isOpen: true,
      message: "Are you sure you want to delete this message?",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await apiFetch(
            `/api/chat/messages/${msgId}`,
            {
              method: "DELETE",
            },
            user?.username,
          );
          if (res.ok) {
            fetchMessages(selectedThread?.id || "", false);
            showToast("Message deleted", "success");
          } else {
            showToast(res.error || "Cannot delete message", "error");
          }
        } catch (e) {
          console.error(e);
        }
      },
    });
  };

  const getThreadTitle = (thread: Thread) => {
    if (thread.is_group) return thread.name;
    if (!thread.participants) return "Unknown";
    const otherUser =
      thread.participants.find((p) => p !== user?.username) || user?.username;
    return directory.find((u) => u.username === otherUser)?.name || otherUser;
  };

  const handleAddMember = async () => {
    if (selectedUsers.length === 0 || !selectedThread) return;
    try {
      const res = await apiFetch(
        `/api/chat/threads/${selectedThread.id}/participants`,
        {
          method: "POST",
          body: JSON.stringify({ users: selectedUsers }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Members added to group", "success");
        setShowAddMember(false);
        setSelectedUsers([]);
        fetchThreads();
      } else {
        showToast(res.error || "Failed to add members", "error");
      }
    } catch (e) {
      showToast("Failed to add members", "error");
    }
  };

  const handleRemoveMember = async (usernameToRemove: string) => {
    if (!selectedThread) return;
    setConfirmModal({
      isOpen: true,
      message: `Are you sure you want to remove ${usernameToRemove}?`,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await apiFetch(
            `/api/chat/threads/${selectedThread.id}/participants/${usernameToRemove}`,
            {
              method: "DELETE",
            },
            user?.username,
          );
          if (res.ok) {
            showToast("Member removed", "success");
            if (usernameToRemove === user?.username) {
              setSelectedThread(null);
            }
            fetchThreads();
          } else {
            showToast(res.error || "Failed to remove member", "error");
          }
        } catch (e) {
          showToast("Failed to remove member", "error");
        }
      },
    });
  };

  const handleDeleteThread = async () => {
    if (!selectedThread) return;
    setConfirmModal({
      isOpen: true,
      message:
        "Are you sure you want to delete this conversation for all members? This cannot be undone.",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await apiFetch(
            `/api/chat/threads/${selectedThread.id}`,
            {
              method: "DELETE",
            },
            user?.username,
          );
          if (res.ok) {
            showToast("Conversation deleted", "success");
            setSelectedThread(null);
            fetchThreads();
          } else {
            showToast(res.error || "Failed to delete conversation", "error");
          }
        } catch (e) {
          showToast("Failed to delete conversation", "error");
        }
      },
    });
  };

  const filteredDirectory = directory.filter(
    (u) =>
      u.username !== user?.username &&
      (u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const stripMarkdown = (text: string | null) => {
    if (!text) return text;
    return text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1"); // Strip markdown links too
  };

  return (
    <div className="space-y-12 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Messages"
        subtitle="Team announcements and discussion"
        icon={<MessageSquare className="w-6 h-6" />}
      />

      <div className="h-[calc(100vh-22rem)] min-h-[400px] bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm flex flex-col sm:flex-row">
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              setAttachingFile(e.target.files[0]);
            }
          }}
        />

        {/* LEFT PANEL: CHAT LIST */}
        <div className="w-full sm:w-80 border-r border-stone-200/60 flex flex-col bg-stone-50/30 flex-shrink-0 min-w-0 sm:min-h-full h-2/5 sm:h-auto">
          <div className="p-6 border-b border-stone-200/50 flex items-center justify-between bg-white shrink-0">
            <h2 className="font-extrabold text-stone-900 text-[11px] uppercase tracking-[0.2em]">
              Conversations
            </h2>
            <button
              onClick={() => setShowNewChat(true)}
              className="p-2.5 bg-stone-800 hover:bg-stone-900 text-white rounded-xl transition-all active:scale-95 shadow-sm"
              title="Start conversation"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-stone-100/70">
            {threads.length === 0 ? (
              <div className="text-center py-24 px-6 animate-in fade-in duration-300">
                <div className="w-12 h-12 bg-stone-100/50 border border-stone-200/55 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-5 h-5 text-stone-400" />
                </div>
                <p className="text-xs font-bold text-stone-800 uppercase tracking-widest">
                  No chats yet
                </p>
                <p className="text-[10px] text-stone-400 font-semibold mt-1.5 leading-relaxed">
                  Initiate communication with team members.
                </p>
              </div>
            ) : (
              threads.map((thread) => {
                const isSelected = selectedThread?.id === thread.id;
                const titleStr = getThreadTitle(thread);
                const isUnread = !!(thread as any).unread_count;
                const initials = titleStr.substring(0, 2).toUpperCase();
                const colorClass = getColorHash(titleStr);

                return (
                  <div
                    key={thread.id}
                    onClick={() => setSelectedThread(thread)}
                    className={cn(
                      "p-5 flex items-center gap-4 cursor-pointer relative transition-all group/item",
                      isSelected
                        ? "bg-stone-100/70"
                        : "hover:bg-white bg-transparent",
                    )}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-stone-800" />
                    )}

                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 font-bold text-xs tracking-tight shadow-2xs transition-all",
                        isSelected ? "scale-[1.02]" : "",
                        colorClass,
                      )}
                    >
                      {initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p
                          className={cn(
                            "truncate text-[13px] tracking-tight transition-colors",
                            isUnread
                              ? "font-bold text-stone-950"
                              : "font-bold text-stone-900",
                          )}
                        >
                          {titleStr}
                        </p>
                        {thread.last_message_time && (
                          <span
                            className={cn(
                              "text-[9px] uppercase font-bold tracking-tighter shrink-0 transition-colors",
                              isUnread ? "text-stone-950" : "text-stone-450",
                            )}
                          >
                            {(() => {
                              try {
                                const d = new Date(thread.last_message_time.replace(" ", "T") + (thread.last_message_time.includes("Z") ? "" : "Z"));
                                return isNaN(d.getTime()) ? "--:--" : d.toLocaleTimeString("en-US", {
                                  timeZone: "Asia/Jakarta",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                              } catch {
                                return "--:--";
                              }
                            })()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "text-xs truncate h-4 flex-1 tracking-tight transition-colors",
                            isUnread
                              ? "text-stone-950 font-bold"
                              : "text-stone-500 font-medium",
                          )}
                        >
                          {stripMarkdown(thread.last_message) || (
                            <span className="italic text-stone-400 font-normal">
                              No messages yet
                            </span>
                          )}
                        </p>
                        {isUnread && (
                          <div className="flex items-center justify-center bg-stone-800 text-white text-[9px] font-bold h-4.5 min-w-[18px] px-1 rounded-full shrink-0 shadow-sm">
                            {(thread as any).unread_count > 99
                              ? "99+"
                              : (thread as any).unread_count}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          {selectedThread ? (
            <>
              {/* Header */}
              <div className="px-6 py-4.5 border-b border-stone-200/50 items-center justify-between flex shrink-0 bg-white z-10">
                <div className="flex items-center gap-3.5">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs",
                      getColorHash(getThreadTitle(selectedThread)),
                    )}
                  >
                    {getThreadTitle(selectedThread)
                      .substring(0, 2)
                      .toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-stone-900 text-sm tracking-tight leading-none">
                      {getThreadTitle(selectedThread)}
                    </h3>
                    <p
                      onClick={() => setShowMembersList(true)}
                      className="text-[9px] uppercase font-bold text-stone-400 hover:text-stone-900 cursor-pointer transition-colors tracking-widest mt-1.5 flex items-center gap-1.5"
                    >
                      {selectedThread.is_group ? (
                        <>
                          <Users className="w-3 h-3 text-stone-400" />
                          {selectedThread.participants?.length || 0} members •
                          Manage
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          Secure Peer Connection
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!!selectedThread.is_group && (
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="px-3.5 py-2 bg-stone-50 hover:bg-stone-100 text-stone-600 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all border border-stone-200/50"
                    >
                      Add Member
                    </button>
                  )}
                  <button
                    onClick={handleDeleteThread}
                    className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100/50 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all"
                    title="Delete conversation for everyone"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 bg-stone-50/10 relative">
                {messages.length === 0 && (
                  <div className="text-center py-24 max-w-sm mx-auto">
                    <div className="w-12 h-12 bg-white border border-stone-200/50 shadow-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="text-xs font-bold text-stone-900 tracking-wider uppercase">
                      Linear Log Opened
                    </div>
                    <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-[0.1em] mt-1.5 leading-relaxed">
                      All communications are referenced via secure Supply Trace
                      codes.
                    </p>
                  </div>
                )}
                {messages.map((msg) => {
                  const isMine = msg.sender_username === user?.username;
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex items-start gap-3 max-w-[85%] group animate-in slide-in-from-bottom-1 duration-300",
                        isMine ? "ml-auto flex-row-reverse" : "mr-auto",
                      )}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg border shadow-3xs flex justify-center items-center shrink-0 font-bold text-[10px]",
                          getColorHash(msg.sender_username),
                        )}
                      >
                        {msg.sender_username.substring(0, 2).toUpperCase()}
                      </div>

                      <div
                        className={cn(
                          "flex flex-col gap-1",
                          isMine ? "items-end" : "items-start",
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase tracking-widest",
                              isMine ? "text-stone-805" : "text-stone-500",
                            )}
                          >
                            {isMine ? "You" : msg.sender_username}
                          </span>
                        </div>

                        <div
                          className={cn(
                            "px-5 py-3.5 rounded-3xl text-sm whitespace-pre-wrap relative shadow-2xs border transition-colors",
                            msg.is_deleted
                              ? "bg-transparent border-stone-100 text-stone-400 italic"
                              : isMine
                                ? "bg-emerald-50/45 border-emerald-100/80 text-stone-850 rounded-tr-sm"
                                : "bg-white border-stone-200/80 text-stone-850 rounded-tl-sm",
                          )}
                        >
                          {(() => {
                            if (msg.is_deleted) return msg.content;

                            let contentToParse = msg.content || "";
                            let sharedBlock = null;

                            // Check for explicit shared resource block
                            const sharedMatch = contentToParse.match(
                              /🔗 \*Shared Resource: (.*)\* \((PROJECT|PR|PO)\) #(.*)$/s,
                            );

                            if (sharedMatch) {
                              const [fullMatch, title, type, itemId] =
                                sharedMatch;
                              contentToParse = contentToParse
                                .replace(fullMatch, "")
                                .trim();

                              const getIcon = () => {
                                switch (type) {
                                  case "PROJECT":
                                    return <Briefcase className="w-4 h-4" />;
                                  case "PR":
                                    return (
                                      <ClipboardList className="w-4 h-4" />
                                    );
                                  case "PO":
                                    return <ShoppingCart className="w-4 h-4" />;
                                  default:
                                    return <ExternalLink className="w-4 h-4" />;
                                }
                              };

                              const getLink = () => {
                                switch (type) {
                                  case "PROJECT":
                                    return `/project/${itemId}`;
                                  case "PR":
                                    return `/procurement?pr=${itemId}`;
                                  case "PO":
                                    return `/procurement?po=${itemId}`;
                                  default:
                                    return "#";
                                }
                              };

                              const getLabel = () => {
                                switch (type) {
                                  case "PROJECT":
                                    return "Active Project";
                                  case "PR":
                                    return "Purchase Request";
                                  case "PO":
                                    return "Purchase Order";
                                  default:
                                    return "Resource";
                                }
                              };

                              sharedBlock = (
                                <Link
                                  to={getLink()}
                                  className={cn(
                                    "mt-2 p-3 rounded-xl border flex flex-col gap-2 transition-all hover:ring-2 hover:ring-stone-200",
                                    isMine
                                      ? "bg-white border-stone-200 text-stone-700"
                                      : "bg-stone-50 border-stone-100 text-stone-800",
                                  )}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <div
                                      className={cn(
                                        "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1.5",
                                        isMine
                                          ? "bg-stone-100 text-stone-600 border border-stone-200"
                                          : "bg-white text-stone-500 shadow-sm",
                                      )}
                                    >
                                      {getIcon()} {getLabel()}
                                    </div>
                                    <ExternalLink className="w-3 h-3 opacity-60" />
                                  </div>
                                  <div className="font-bold tracking-tight text-sm leading-snug">
                                    {title}
                                  </div>
                                  <div
                                    className={cn(
                                      "text-[10px] font-medium opacity-60 flex items-center gap-1",
                                      isMine
                                        ? "text-stone-500"
                                        : "text-stone-500",
                                    )}
                                  >
                                    ID: {itemId}
                                  </div>
                                </Link>
                              );
                            }

                            // Parse inline IDs like PR-1234, PROJ-123, PO-123, WO-123 into nice links
                            const regex =
                              /(PR-[\w\d\-]+|PO-[\w\d\-]+|PROJ-[\w\d\-]+|PRJ-[\w\d\-]+|WO-[\w\d\-]+|REQ-[\w\d\-]+)/g;

                            // Pre-process content to transform inline IDs into Markdown links for ReactMarkdown to handle
                            const processedContent = contentToParse.replace(
                              regex,
                              (match) => {
                                let link = "#";
                                if (
                                  match.startsWith("PROJ-") ||
                                  match.startsWith("PRJ-")
                                ) {
                                  link = `/project/${match}`;
                                } else if (
                                  match.startsWith("PR-") ||
                                  match.startsWith("REQ-")
                                ) {
                                  link = `/procurement?pr=${match}`;
                                } else if (match.startsWith("PO-")) {
                                  link = `/procurement?po=${match}`;
                                } else if (match.startsWith("WO-")) {
                                  link = `/production?wo=${match}`;
                                }
                                return `[${match}](${link})`;
                              },
                            );

                            return (
                              <div className="flex flex-col">
                                {contentToParse && (
                                  <div className="leading-relaxed prose prose-stone prose-sm max-w-none">
                                    <ReactMarkdown
                                      components={{
                                        a: ({ node, ...props }) => {
                                          // Check if this is one of our special inline IDs
                                          const isInternalLink = (
                                            props.children as string
                                          )?.match?.(regex);
                                          if (isInternalLink) {
                                            let icon = null;
                                            const part =
                                              props.children as string;
                                            if (
                                              part.startsWith("PROJ-") ||
                                              part.startsWith("PRJ-")
                                            )
                                              icon = (
                                                <Briefcase className="w-3.5 h-3.5" />
                                              );
                                            else if (
                                              part.startsWith("PR-") ||
                                              part.startsWith("REQ-")
                                            )
                                              icon = (
                                                <ClipboardList className="w-3.5 h-3.5" />
                                              );
                                            else if (part.startsWith("PO-"))
                                              icon = (
                                                <ShoppingCart className="w-3.5 h-3.5" />
                                              );
                                            else if (part.startsWith("WO-"))
                                              icon = (
                                                <Settings className="w-3.5 h-3.5" />
                                              );

                                            return (
                                              <Link
                                                to={props.href || "#"}
                                                className={cn(
                                                  "inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded border transition-colors group relative no-underline border-stone-200",
                                                  isMine
                                                    ? "bg-white text-stone-700 hover:bg-stone-50"
                                                    : "bg-stone-100/80 text-stone-900 hover:bg-white",
                                                )}
                                              >
                                                <span
                                                  className={
                                                    isMine
                                                      ? "text-stone-400"
                                                      : "text-stone-500"
                                                  }
                                                >
                                                  {icon}
                                                </span>
                                                <span className="font-semibold text-xs tracking-tight">
                                                  {part}
                                                </span>
                                              </Link>
                                            );
                                          }
                                          return (
                                            <a
                                              {...props}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-blue-500 hover:underline"
                                            />
                                          );
                                        },
                                        p: ({ children }) => (
                                          <p className="mb-0 last:mb-0 whitespace-pre-wrap">
                                            {children}
                                          </p>
                                        ),
                                        strong: ({ children }) => (
                                          <strong className="font-bold text-stone-900">
                                            {children}
                                          </strong>
                                        ),
                                        em: ({ children }) => (
                                          <em className="italic">{children}</em>
                                        ),
                                      }}
                                    >
                                      {processedContent}
                                    </ReactMarkdown>
                                  </div>
                                )}
                                {sharedBlock}
                              </div>
                            );
                          })()}
                        </div>

                        {msg.file_url && !msg.is_deleted && (
                          <a
                            href={msg.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              "mt-2 mb-1 p-2.5 rounded-xl flex items-center gap-2 border hover:opacity-90 transition-opacity",
                              isMine
                                ? "bg-stone-800 border-stone-950 text-white"
                                : "bg-stone-50 border-stone-200 text-stone-850",
                            )}
                          >
                            <File className="w-4 h-4 shrink-0 text-stone-400" />
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold truncate w-32 sm:w-48 leading-tight">
                                {msg.file_name}
                              </p>
                              <p className="text-[9px] opacity-70">
                                {((msg.file_size || 0) / 1024).toFixed(1)} KB
                              </p>
                            </div>
                          </a>
                        )}

                        {/* Adaptive, perfectly aligned read status & time inline */}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] text-stone-400 font-bold uppercase tracking-tight">
                            {(() => {
                              try {
                                const d = new Date(msg.created_at.replace(" ", "T") + (msg.created_at.includes("Z") ? "" : "Z"));
                                return isNaN(d.getTime()) ? "--:--" : d.toLocaleTimeString("en-US", {
                                  timeZone: "Asia/Jakarta",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                              } catch {
                                return "--:--";
                              }
                            })()}
                          </span>
                          {isMine && !msg.is_deleted && (
                            <span className="shrink-0 animate-in fade-in duration-200">
                              {(() => {
                                let readObj = [];
                                try {
                                  readObj = JSON.parse(msg.read_by || "[]");
                                } catch (e) {}
                                const isRead = readObj.length > 0;
                                return isRead ? (
                                  <svg
                                    className="w-3.5 h-3.5 text-emerald-500"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M18 6 7 17l-5-5" />
                                    <path d="m22 10-7.5 7.5L13 16" />
                                  </svg>
                                ) : (
                                  <svg
                                    className="w-3.5 h-3.5 text-stone-300"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M20 6 9 17l-5-5" />
                                  </svg>
                                );
                              })()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Custom Controls shown only on bubble group-hover */}
                      {isMine && !msg.is_deleted && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center self-center pt-3">
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-1.5 bg-white border border-stone-200 hover:border-red-200 shadow-sm text-red-500 rounded-full hover:bg-red-50 transition-all transform hover:scale-[1.08]"
                            title="Delete message"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Reply Form */}
              <div className="p-4 bg-white border-t border-stone-205 shrink-0">
                {attachingFile && (
                  <div className="mb-3.5 flex items-center bg-stone-50 border border-stone-200/60 rounded-2xl p-3 w-max pr-5 gap-3.5 shadow-2xs animate-in slide-in-from-bottom-2 duration-300">
                    <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
                      <File className="w-4 h-4 text-stone-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-800">
                        {attachingFile.name}
                      </p>
                      <p className="text-[10px] text-stone-400 font-semibold uppercase font-mono">
                        {(attachingFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => setAttachingFile(null)}
                      className="ml-4 p-1.5 hover:bg-stone-200 hover:text-stone-900 rounded-lg text-stone-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center gap-3"
                >
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3.5 text-stone-450 hover:text-stone-700 hover:bg-stone-50 rounded-2xl transition-colors disabled:opacity-50"
                    title="Attach file"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Provide thoughts or reference items (e.g. PR-123)..."
                    className="flex-1 bg-stone-50 border border-stone-200/50 hover:border-stone-300 rounded-2xl px-5 py-4 text-sm font-semibold text-stone-900 placeholder:text-stone-450 focus:bg-white focus:border-stone-300 focus:ring-4 focus:ring-stone-100/50 outline-none transition-all shadow-2xs"
                    disabled={uploading}
                  />
                  <button
                    type="submit"
                    disabled={
                      (!newMessage.trim() && !attachingFile) || uploading
                    }
                    className="px-5 py-4 bg-stone-800 text-white rounded-2xl hover:bg-stone-850 disabled:opacity-40 disabled:hover:bg-stone-800 transition-all shadow-md flex items-center justify-center shrink-0"
                  >
                    {uploading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        <span className="text-xs font-bold uppercase tracking-wider hidden md:inline">
                          Send
                        </span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mb-6">
                <MessageSquare className="w-8 h-8 text-stone-400" />
              </div>
              <h2 className="text-xl font-medium text-stone-800 mb-2">
                Your Conversations
              </h2>
              <p className="text-stone-500 max-w-sm mb-6">
                Select a chat from the sidebar or start a new conversation with
                a colleague.
              </p>
              <button
                onClick={() => setShowNewChat(true)}
                className="px-6 py-2.5 bg-stone-800 text-white text-sm font-medium rounded-lg hover:bg-stone-900 transition-colors shadow-sm inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Message
              </button>
            </div>
          )}
        </div>
      </div>

      {/* NEW CHAT MODAL */}
      <Modal
        isOpen={showNewChat}
        onClose={() => {
          setShowNewChat(false);
          setSelectedUsers([]);
          setGroupName("");
        }}
        title="New Message"
        description="Select users to start chatting"
        contentClassName="p-0 flex flex-col h-full"
      >
        <div className="p-4 border-b border-stone-100">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-stone-200 focus:outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredDirectory.map((u) => {
            const isSelected = selectedUsers.includes(u.username);
            return (
              <div
                key={u.username}
                onClick={() => {
                  if (isSelected) {
                    setSelectedUsers((prev) =>
                      prev.filter((p) => p !== u.username),
                    );
                  } else {
                    setSelectedUsers((prev) => [...prev, u.username]);
                  }
                }}
                className="flex items-center px-4 py-3 hover:bg-stone-50 cursor-pointer rounded-xl transition-colors"
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded border mr-4 flex items-center justify-center mt-0.5",
                    isSelected
                      ? "bg-stone-800 border-stone-900 text-white"
                      : "border-stone-300 bg-white",
                  )}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </div>
                <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center mr-3 shrink-0">
                  <User className="w-5 h-5 text-stone-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-800">
                    {u.name}
                  </p>
                  <p className="text-xs text-stone-500">
                    @{u.username} • {u.role}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {selectedUsers.length > 0 && (
          <div className="p-4 border-t border-stone-100 bg-stone-50 flex flex-col gap-3 shrink-0">
            {selectedUsers.length > 1 && (
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name (required)"
                className="w-full px-4 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-stone-200 focus:outline-none transition-all"
              />
            )}
            <Button
              onClick={handleCreateChat}
              disabled={selectedUsers.length > 1 && !groupName.trim()}
              className="w-full"
            >
              {selectedUsers.length > 1 ? "Create Group Chat" : "Start Chat"}
            </Button>
          </div>
        )}
      </Modal>

      {/* MEMBER LIST MODAL */}
      <Modal
        isOpen={showMembersList && selectedThread !== null}
        onClose={() => setShowMembersList(false)}
        title="Members"
        maxWidth="sm"
        contentClassName="p-2 flex flex-col"
      >
        <div className="overflow-y-auto">
          {selectedThread?.participants.map((pUser) => {
            const dirUser = directory.find((d) => d.username === pUser);
            return (
              <div
                key={pUser}
                className="flex items-center justify-between px-4 py-3 hover:bg-stone-50 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center">
                    <User className="w-4 h-4 text-stone-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-800">
                      {dirUser?.name || pUser}
                    </p>
                    <p className="text-[10px] text-stone-500">@{pUser}</p>
                  </div>
                </div>
                {selectedThread.is_group && (
                  <button
                    onClick={() => handleRemoveMember(pUser)}
                    className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* ADD MEMBER MODAL */}
      <Modal
        isOpen={showAddMember && selectedThread !== null}
        onClose={() => {
          setShowAddMember(false);
          setSelectedUsers([]);
        }}
        title="Add Members"
        description="Select users to add to the group"
        contentClassName="p-0 flex flex-col h-full"
      >
        <div className="p-4 border-b border-stone-100">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-stone-200 focus:outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {selectedThread &&
            filteredDirectory.filter(
              (u) => !selectedThread.participants.includes(u.username),
            ).length === 0 && (
              <p className="text-center text-stone-500 text-sm mt-4">
                No new users to add.
              </p>
            )}
          {selectedThread &&
            filteredDirectory
              .filter((u) => !selectedThread.participants.includes(u.username))
              .map((u) => {
                const isSelected = selectedUsers.includes(u.username);
                return (
                  <div
                    key={u.username}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedUsers((prev) =>
                          prev.filter((p) => p !== u.username),
                        );
                      } else {
                        setSelectedUsers((prev) => [...prev, u.username]);
                      }
                    }}
                    className="flex items-center px-4 py-3 hover:bg-stone-50 cursor-pointer rounded-xl transition-colors"
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded border mr-4 flex items-center justify-center mt-0.5",
                        isSelected
                          ? "bg-stone-800 border-stone-900 text-white"
                          : "border-stone-300 bg-white",
                      )}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center mr-3 shrink-0">
                      <User className="w-5 h-5 text-stone-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-stone-800">
                        {u.name}
                      </p>
                      <p className="text-xs text-stone-500">
                        @{u.username} • {u.role}
                      </p>
                    </div>
                  </div>
                );
              })}
        </div>

        {selectedUsers.length > 0 && (
          <div className="p-4 border-t border-stone-100 bg-stone-50 flex flex-col gap-3 shrink-0">
            <Button onClick={handleAddMember} className="w-full">
              Add {selectedUsers.length} Users
            </Button>
          </div>
        )}
      </Modal>

      {/* CONFIRM MODAL */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title="Confirm Action"
        message={confirmModal.message}
        confirmText="Confirm"
        isDestructive={true}
      />
    </div>
  );
}
