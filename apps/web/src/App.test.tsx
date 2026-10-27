import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./api";
import { downloadExport } from "./export";
import type { Endpoint, Snapshot } from "./types";

vi.mock("./api", () => ({api:{health:vi.fn(),current:vi.fn(),inspect:vi.fn(),workspace:vi.fn(),execute:vi.fn(),update:vi.fn(),retrySync:vi.fn()}}));
vi.mock("./export", async (importOriginal) => ({...await importOriginal<typeof import("./export")>(),downloadExport:vi.fn()}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });
const endpoints: Endpoint[] = ["/admin", "/user"].map((path) => ({
  id:`GET ${path}`,path,method:"GET",summary:"",description:"",tags:["Test"],
  deprecated:false,parameters:[],security:[{bearer:[]}],requestBody:null,responses:{},fingerprint:path,
}));
const snapshot: Snapshot = {title:"Test API",version:"1",hash:"abc",endpoints,securitySchemes:{bearer:{type:"http",scheme:"bearer"}}};
function setup() {
  vi.mocked(api.health).mockResolvedValue({mode:"local",csrf_token:"csrf",base_url:"http://127.0.0.1:8000",spec_url:"http://127.0.0.1:8000/openapi.json",version:"1"});
  vi.mocked(api.current).mockResolvedValue({snapshot});
  vi.mocked(api.inspect).mockResolvedValue(snapshot);
  vi.mocked(api.workspace).mockResolvedValue({endpoints:{},activity:[]});
  vi.mocked(api.execute).mockResolvedValue({status:200,reason:"OK",body:"{}",headers:{},bytes:2,duration_ms:1,truncated:false,content_type:"application/json",url:"http://127.0.0.1:8000/admin",method:"GET"});
  render(<App />);
}
it("ignores a workspace poll that completes after a note save", async () => {
  const interval = window.setInterval;
  let poll: (() => Promise<void>) | undefined;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: TimerHandler, delay?: number) => {
    if (delay === 5000) poll = callback as () => Promise<void>;
    return interval(callback, delay);
  }) as typeof setInterval);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  setup(); fireEvent.click(await screen.findByRole("button", {name:"GET /admin"}));
  fireEvent.click(screen.getByText("Notes & activity"));
  let finish: ((value: {endpoints:{},activity:[]}) => void) | undefined;
  vi.mocked(api.workspace).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  let polling: Promise<void>;
  await act(async()=>{ polling=poll!(); });
  vi.mocked(api.update).mockResolvedValue({endpoints:{"GET /admin":{endpoint_id:"GET /admin",fingerprint:"/admin",progress:"done",note:"New saved note",active:1,updated_at:"2026-10-12T00:00:00Z"}},activity:[]});
  fireEvent.change(screen.getByLabelText("Local endpoint note"),{target:{value:"New saved note"}});
  fireEvent.click(screen.getByRole("button",{name:"Save note"}));
  await screen.findByText("Local note saved.");
  await act(async()=>{ finish!({endpoints:{},activity:[]}); await polling!; });
  expect(screen.getByLabelText("Local endpoint note")).toHaveValue("New saved note");
  expect(screen.getByRole("button",{name:"Cancel edit"})).toBeDisabled();
});
it("requests an enabled team sync explicitly without treating it as acknowledged", async () => {
  setup(); await screen.findByRole("button",{name:"GET /admin"});
  vi.mocked(api.workspace).mockResolvedValue({endpoints:{},activity:[],status_sync:{enabled:true,state:"error",error:"Check Git access"}});
  fireEvent.click(screen.getByRole("button",{name:"Sync"}));
  const retry=await screen.findByRole("button",{name:"Sync team statuses"});
  vi.mocked(api.retrySync).mockResolvedValue({endpoints:{},activity:[],status_sync:{enabled:true,state:"syncing"}});
  fireEvent.click(retry);
  await waitFor(()=>expect(api.retrySync).toHaveBeenCalledWith("csrf"));
  await screen.findByText("Team statuses: syncing");
  expect(screen.queryByText("Team statuses: synced")).not.toBeInTheDocument();
});
it("names the browser tab after the discovered application", async () => {
  setup();
  await waitFor(() => expect(document.title).toBe("Relay - Test API"));
});
it("authorizes in a dialog without expanding an endpoint; only submission changes credentials", async () => {
  setup();
  const admin = await screen.findByRole("button", {name:"GET /admin"});
  expect(screen.queryByLabelText("Bearer token")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Authorize workspace"}));
  fireEvent.change(screen.getByLabelText("Bearer token"),{target:{value:"shared-user"}});
  fireEvent.click(screen.getByRole("button",{name:"Authorize"}));
  fireEvent.click(screen.getByRole("button",{name:"Configure auth for GET /admin"}));
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Authorize endpoint");
  expect(admin).toHaveAttribute("aria-expanded","false");
  fireEvent.change(screen.getByLabelText("Bearer token"),{target:{value:"Bearer admin-token"}});
  fireEvent.click(screen.getByRole("button",{name:"Authorize"}));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Configure auth for GET /admin"})).toHaveTextContent("Bearer");
  fireEvent.click(screen.getByRole("button",{name:"Authorize workspace"}));
  expect(screen.getByLabelText("Bearer token")).toHaveValue("shared-user");
  fireEvent.change(screen.getByLabelText("Bearer token"),{target:{value:"unsaved"}});
  fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
  fireEvent.click(admin);
  fireEvent.click(screen.getByRole("button",{name:"Execute request"}));
  await waitFor(() => expect(api.execute).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.execute).mock.calls[0][1].headers.Authorization).toBe("Bearer admin-token");
  fireEvent.click(screen.getByRole("button",{name:"GET /user"}));
  fireEvent.click(screen.getByRole("button",{name:"Execute request"}));
  await waitFor(() => expect(api.execute).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.execute).mock.calls[1][1].headers.Authorization).toBe("Bearer shared-user");
  fireEvent.click(screen.getByRole("button",{name:"Configure auth for GET /admin"}));
  expect(screen.getByLabelText("Bearer token")).toHaveValue("admin-token");
  fireEvent.click(screen.getByRole("button",{name:"Use shared auth"}));
  fireEvent.click(admin);
  fireEvent.click(screen.getByRole("button",{name:"Execute request"}));
  await waitFor(() => expect(api.execute).toHaveBeenCalledTimes(3));
  expect(vi.mocked(api.execute).mock.calls[2][1].headers.Authorization).toBe("Bearer shared-user");
});
it("opens deeper settings from the endpoint dialog and keeps request shortcuts out of it", async () => {
  setup();
  const admin = await screen.findByRole("button",{name:"GET /admin"});
  fireEvent.click(admin);
  fireEvent.click(screen.getByRole("button",{name:"Configure auth for GET /admin"}));
  fireEvent.keyDown(screen.getByLabelText("Bearer token"),{key:"Enter",ctrlKey:true});
  expect(api.execute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Advanced settings"}));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(admin).toHaveAttribute("aria-expanded","true");
  expect(screen.getByLabelText("Authentication")).toHaveFocus();
  fireEvent.change(screen.getByLabelText("Authentication"),{target:{value:"API key"}});
  expect(screen.getByLabelText("API key value")).toBeVisible();
});

it("refreshes team status without collapsing the tester or clearing its response", async () => {
  const interval = window.setInterval;
  let poll: (() => Promise<void>) | undefined;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: TimerHandler, delay?: number) => {
    if (delay === 5000) poll = callback as () => Promise<void>;
    return interval(callback, delay);
  }) as typeof setInterval);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  setup();
  fireEvent.click(await screen.findByRole("button", {name:"GET /admin"}));
  fireEvent.click(screen.getByRole("button", {name:"Execute request"}));
  await screen.findByText("200 OK");
  vi.mocked(api.workspace).mockResolvedValue({endpoints:{"GET /admin":{endpoint_id:"GET /admin",note:"",active:1,progress:"needs_fixing",fingerprint:"/admin",updated_by:{name:"Sam",email:"sam@example.test"},updated_at:"2026-10-09T09:00:00Z"}},activity:[]});
  expect(poll).toBeDefined();
  await act(async () => { await poll!(); });
  expect(screen.getByRole("button", {name:"GET /admin"})).toHaveAttribute("aria-expanded","true");
  expect(screen.getByText("200 OK")).toBeVisible();
  expect(screen.getByRole("combobox", {name:"Status for GET /admin"})).toHaveValue("needs_fixing");
});

it("includes the current workspace status in endpoint exports", async () => {
  setup();
  const endpoint = await screen.findByRole("button", {name:"GET /admin"});
  vi.mocked(api.workspace).mockResolvedValue({endpoints:{"GET /admin":{endpoint_id:"GET /admin",fingerprint:"/admin",progress:"needs_fixing",note:"",active:1,updated_at:"2026-10-09T09:00:00Z"}},activity:[]});
  fireEvent.click(screen.getByRole("button", {name:"Sync"}));
  await waitFor(() => expect(screen.getByRole("combobox", {name:"Status for GET /admin"})).toHaveValue("needs_fixing"));
  fireEvent.click(endpoint);
  fireEvent.click(screen.getByText("Export"));
  fireEvent.click(screen.getByRole("button", {name:/JSON/}));
  await waitFor(() => expect(downloadExport).toHaveBeenCalled());
  expect(vi.mocked(downloadExport).mock.calls[0][1].endpoint.progress).toBe("needs_fixing");
  expect(api.execute).not.toHaveBeenCalled();
});

it("sends the displayed team revision when changing a realtime status", async () => {
  setup();
  await screen.findByRole("button", {name:"GET /admin"});
  const current = {endpoints:{"GET /admin":{endpoint_id:"GET /admin",fingerprint:"/admin",progress:"done" as const,note:"",active:1,updated_at:"2026-10-27T00:00:00Z",team_revision:7}},activity:[],status_sync:{enabled:true,mode:"realtime" as const,state:"synced"}};
  vi.mocked(api.workspace).mockResolvedValue(current);
  vi.mocked(api.update).mockResolvedValue(current);
  fireEvent.click(screen.getByRole("button", {name:"Sync"}));
  await screen.findByText("Team statuses (realtime): synced");
  fireEvent.change(screen.getByRole("combobox",{name:"Status for GET /admin"}),{target:{value:"in_progress"}});
  await waitFor(()=>expect(api.update).toHaveBeenCalledWith("csrf","GET /admin","/admin","in_progress",undefined,7));
  expect(api.execute).not.toHaveBeenCalled();
});

it("shows the accepted peer status after a rejected stale edit without retrying it", async () => {
  setup();
  await screen.findByRole("button", {name:"GET /admin"});
  const peer = {endpoints:{"GET /admin":{endpoint_id:"GET /admin",fingerprint:"/admin",progress:"needs_fixing" as const,note:"",active:1,updated_at:"2026-10-27T00:00:00Z",team_revision:8}},activity:[]};
  vi.mocked(api.workspace).mockResolvedValue(peer);
  vi.mocked(api.update).mockRejectedValueOnce(new Error("A teammate changed this endpoint. Review its latest status before retrying."));
  fireEvent.change(screen.getByRole("combobox",{name:"Status for GET /admin"}),{target:{value:"in_progress"}});
  await screen.findByText("A teammate changed this endpoint. Review its latest status before retrying.");
  expect(screen.getByRole("combobox",{name:"Status for GET /admin"})).toHaveValue("needs_fixing");
  expect(api.update).toHaveBeenCalledTimes(1);
});

it("keeps API testing available for read-only team members", async () => {
  setup();
  await screen.findByRole("button",{name:"GET /admin"});
  vi.mocked(api.workspace).mockResolvedValue({endpoints:{},activity:[],status_sync:{enabled:true,mode:"realtime",state:"synced",can_write:false}});
  fireEvent.click(screen.getByRole("button",{name:"Sync"}));
  await screen.findByText("Read-only project access");
  expect(screen.getByRole("combobox",{name:"Status for GET /admin"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"GET /admin"}));
  expect(screen.getByRole("button",{name:"Execute request"})).toBeEnabled();
  fireEvent.click(screen.getByRole("button",{name:"Execute request"}));
  await screen.findByText("200 OK");
  expect(api.update).not.toHaveBeenCalled();
});
