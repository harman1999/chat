import type { Attachment, AttachmentKind, ID } from "@/types";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export interface UploadTicket {
  uploadUrl: string;
  attachmentId: ID;
}

function kindFor(file: File): AttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (/zip|tar|gzip|rar/.test(file.type)) return "archive";
  if (/json|javascript|typescript|xml|csv/.test(file.type)) return "code";
  return "document";
}

export const fileService = {
  /** Reserves an attachment and returns where to PUT the bytes. */
  async createUploadTicket(fileName: string, sizeBytes: number, mimeType?: string): Promise<UploadTicket> {
    if (USE_MOCK_TRANSPORT) {
      return mockResolve({ uploadUrl: "about:blank", attachmentId: `att_${Date.now()}` }, 60);
    }
    return request<UploadTicket>("/files/upload-ticket", {
      method: "POST",
      body: { fileName, sizeBytes, mimeType },
    });
  },

  /**
   * Ticket, then bytes — the same two-step an S3 presigned upload uses, so the
   * caller is unchanged when storage moves off local disk.
   */
  async upload(file: File): Promise<Attachment> {
    const ticket = await fileService.createUploadTicket(file.name, file.size, file.type);
    const isImage = file.type.startsWith("image/");

    if (USE_MOCK_TRANSPORT) {
      const objectUrl = isImage ? URL.createObjectURL(file) : "#";
      return {
        id: ticket.attachmentId,
        name: file.name,
        kind: kindFor(file),
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        url: objectUrl,
        thumbnailUrl: isImage ? objectUrl : null,
        uploadedAt: new Date().toISOString(),
        uploadedBy: "",
      };
    }

    const response = await fetch(ticket.uploadUrl, {
      method: "PUT",
      body: file,
      credentials: "include",
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!response.ok) throw new Error(`Upload failed with ${response.status}`);

    const url = `/api/v1/files/${ticket.attachmentId}/content`;
    return {
      id: ticket.attachmentId,
      name: file.name,
      kind: kindFor(file),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      url,
      thumbnailUrl: isImage ? url : null,
      uploadedAt: new Date().toISOString(),
      uploadedBy: "",
    };
  },

  async listForChannel(channelId: ID): Promise<Attachment[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve([]);
    return request<Attachment[]>(`/channels/${channelId}/files`);
  },

  async remove(id: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 60);
    return request<void>(`/files/${id}`, { method: "DELETE" });
  },
};
