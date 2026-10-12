import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Handoff, { type NoteDraft } from "./Handoff";
import type { Endpoint, EndpointMeta } from "./types";
afterEach(cleanup);
const endpoint: Endpoint = {id:"GET /test",method:"GET",path:"/test",summary:"Test",description:"",tags:[],deprecated:false,parameters:[],requestBody:null,responses:{},security:[],fingerprint:"first"};
const meta: EndpointMeta = {endpoint_id:endpoint.id,fingerprint:endpoint.fingerprint,progress:"done",note:"Existing",active:1,updated_at:"2026-10-12T00:00:00Z"};

it("retains failed and switched drafts, and only shows this endpoint's events", async () => {
  const drafts=new Map<string, NoteDraft>(), save=vi.fn().mockRejectedValue(new Error("Sync before saving"));
  const props={endpoint,meta,drafts,save,busy:false,activity:[{id:1,endpoint_id:endpoint.id,kind:"note_updated",value:"",created_at:meta.updated_at},{id:2,endpoint_id:"GET /other",kind:"removed",value:"",created_at:meta.updated_at}]};
  const view=render(<Handoff {...props}/>); fireEvent.click(screen.getByText("Notes & activity · Has note"));
  fireEvent.change(screen.getByLabelText("Local endpoint note"),{target:{value:"Unsaved note"}});
  fireEvent.click(screen.getByRole("button",{name:"Save note"}));
  await screen.findByRole("alert"); expect(screen.getByLabelText("Local endpoint note")).toHaveValue("Unsaved note");
  expect(screen.queryByText("Removed from source")).not.toBeInTheDocument();
  view.unmount(); render(<Handoff {...props}/>);
  expect(screen.getByLabelText("Local endpoint note")).toHaveValue("Unsaved note");
});

it("requires explicit review after a contract change and retains notes through metadata refresh", async () => {
  const drafts=new Map<string, NoteDraft>(), save=vi.fn().mockResolvedValue(undefined);
  const props={endpoint,meta,drafts,save,busy:false,activity:[]};
  const view=render(<Handoff {...props}/>); fireEvent.click(screen.getByText("Notes & activity · Has note"));
  fireEvent.change(screen.getByLabelText("Local endpoint note"),{target:{value:"Edit"}});
  view.rerender(<Handoff {...props} endpoint={{...endpoint,fingerprint:"changed"}} meta={{...meta,note:"Another saved value"}}/>);
  expect(screen.getByLabelText("Local endpoint note")).toHaveValue("Edit");
  fireEvent.click(screen.getByRole("button",{name:"Save note"})); expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Use current contract"}));
  fireEvent.click(screen.getByRole("button",{name:"Save note"}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith("Edit"));
  await screen.findByText("Local note saved."); expect(drafts.size).toBe(0);
});
it("does not delete a newer draft when a save finishes after switching endpoints", async () => {
  const drafts=new Map<string, NoteDraft>();
  let finish: (()=>void) | undefined;
  const save=vi.fn().mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const props={endpoint,meta,drafts,save,busy:false,activity:[]};
  const first=render(<Handoff {...props}/>); fireEvent.click(screen.getByText("Notes & activity · Has note"));
  fireEvent.change(screen.getByLabelText("Local endpoint note"),{target:{value:"First edit"}});
  fireEvent.click(screen.getByRole("button",{name:"Save note"})); first.unmount();
  render(<Handoff {...props}/>); fireEvent.click(screen.getByText("Notes & activity · Unsaved edit"));
  fireEvent.change(screen.getByLabelText("Local endpoint note"),{target:{value:"Newer edit"}});
  finish!(); await waitFor(()=>expect(drafts.get(endpoint.id)?.saved).toBe("First edit"));
  expect(drafts.get(endpoint.id)?.value).toBe("Newer edit");
});
