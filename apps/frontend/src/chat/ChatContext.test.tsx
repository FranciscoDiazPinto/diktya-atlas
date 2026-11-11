import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatProvider, useChatMessages } from "./ChatContext.js";

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock("../hooks/useApiClient.js", () => ({ useApiClient: () => ({ get, post, del }) }));
vi.mock("../auth/AuthContext.js", () => ({ useAuth: () => ({ isSessionCurrent: () => true }) }));
function Probe() {
  const chat = useChatMessages();
  return <>
    <span>{chat.loading ? "loading" : "ready"}</span>
    <span>{chat.error}</span>
    {chat.messages.map((message) => <p key={message.id}>{message.content}</p>)}
    <button onClick={() => void chat.clearMessages()}>delete</button>
  </>;
}
const detail = (content: string) => ({ id: "conversation", version: 1, title: "Private", pending: false, nextBefore: null,
  messages: [{ id: "message", role: "assistant", content, sequence: 1 }] });
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); });

describe("historial privado en la interfaz", () => {
  it("recupera del servidor, elimina el historial sin propietario y borra la conversación", async () => {
    localStorage.setItem("atlas-chat-messages", JSON.stringify([{ content: "legacy private" }]));
    get.mockResolvedValueOnce([{ id: "conversation", title: "Private", version: 1 }]).mockResolvedValueOnce(detail("server private"));
    del.mockResolvedValueOnce(undefined);
    render(<ChatProvider><Probe /></ChatProvider>);
    await screen.findByText("server private");
    expect(screen.queryByText("legacy private")).not.toBeInTheDocument();
    expect(localStorage.getItem("atlas-chat-messages")).toBeNull();
    fireEvent.click(screen.getByText("delete"));
    await waitFor(() => expect(screen.queryByText("server private")).not.toBeInTheDocument());
    expect(del).toHaveBeenCalledWith("/chat/conversations/conversation");
  });
  it("ignora el historial tardío de un proveedor desmontado al cambiar de cuenta", async () => {
    let finish!: (value: ReturnType<typeof detail>) => void;
    get.mockResolvedValueOnce([{ id: "conversation", title: "A", version: 1 }])
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<ChatProvider key="A"><Probe /></ChatProvider>);
    await waitFor(() => expect(finish).toBeDefined());
    get.mockResolvedValueOnce([]);
    view.rerender(<ChatProvider key="B"><Probe /></ChatProvider>);
    await screen.findByText("ready");
    await act(async () => { finish(detail("account A secret")); });
    expect(screen.queryByText("account A secret")).not.toBeInTheDocument();
  });
});
